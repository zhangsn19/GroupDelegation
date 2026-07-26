#!/usr/bin/env python3
"""Merge a Prolific export with a Group Deception participants.csv export."""

import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path, rows, columns):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def first_value(row, names):
    for name in names:
        value = str(row.get(name, "") or "").strip()
        if value:
            return value
    return ""


def prolific_identity(row):
    return (
        first_value(row, ["study_id", "STUDY_ID", "prolific_study_id"]),
        first_value(row, ["session_id", "SESSION_ID", "prolific_session_id"]),
    )


def experiment_identity(row):
    return (
        first_value(row, ["prolific_study_id"]),
        first_value(row, ["prolific_session_id"]),
    )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            'PowerShell example: python .\\tools\\merge_prolific_export.py '
            '--prolific-csv "D:\\exports\\prolific.csv" '
            '--experiment-participants-csv "D:\\exports\\participants.csv" '
            '--output-dir "D:\\exports\\merged"'
        ),
    )
    parser.add_argument("--prolific-csv", required=True, type=Path)
    parser.add_argument("--experiment-participants-csv", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    prolific_rows = read_csv(args.prolific_csv)
    experiment_rows = read_csv(args.experiment_participants_csv)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    prolific_counts = Counter(prolific_identity(row) for row in prolific_rows)
    experiment_counts = Counter(experiment_identity(row) for row in experiment_rows)
    prolific_index = {prolific_identity(row): row for row in prolific_rows if prolific_counts[prolific_identity(row)] == 1}
    experiment_index = {experiment_identity(row): row for row in experiment_rows if experiment_counts[experiment_identity(row)] == 1}

    matched = []
    discrepancies = []
    all_keys = sorted(set(prolific_counts) | set(experiment_counts))
    for key in all_keys:
        study_id, session_id = key
        if not study_id or not session_id:
            discrepancies.append({"issue": "missing_identity_key", "prolific_study_id": study_id, "prolific_session_id": session_id})
            continue
        if prolific_counts[key] > 1 or experiment_counts[key] > 1:
            discrepancies.append({"issue": "duplicate_session", "prolific_study_id": study_id, "prolific_session_id": session_id})
            continue
        prolific = prolific_index.get(key)
        experiment = experiment_index.get(key)
        if prolific is None:
            discrepancies.append({"issue": "missing_in_prolific", "prolific_study_id": study_id, "prolific_session_id": session_id})
            continue
        if experiment is None:
            discrepancies.append({"issue": "missing_in_experiment", "prolific_study_id": study_id, "prolific_session_id": session_id})
            continue
        prolific_pid = first_value(prolific, ["participant_id", "PROLIFIC_PID", "prolific_pid"])
        experiment_pid = first_value(experiment, ["prolific_pid"])
        if prolific_pid != experiment_pid:
            discrepancies.append({
                "issue": "pid_mismatch",
                "prolific_study_id": study_id,
                "prolific_session_id": session_id,
                "prolific_pid": prolific_pid,
                "experiment_pid": experiment_pid,
            })
            continue
        prolific_completion = first_value(prolific, ["status", "STATUS", "completion_status"])
        experiment_completion = first_value(experiment, ["status"])
        if prolific_completion and experiment_completion and prolific_completion.lower() in {"approved", "completed"} and experiment_completion.lower() != "completed":
            discrepancies.append({
                "issue": "completion_code_mismatch",
                "prolific_study_id": study_id,
                "prolific_session_id": session_id,
                "prolific_status": prolific_completion,
                "experiment_status": experiment_completion,
            })
            continue
        merged = {f"prolific_{key}": value for key, value in prolific.items()}
        merged.update({f"experiment_{key}": value for key, value in experiment.items()})
        matched.append(merged)

    merged_columns = sorted(set().union(*(row.keys() for row in matched))) if matched else ["experiment_record_key"]
    discrepancy_columns = [
        "issue",
        "prolific_study_id",
        "prolific_session_id",
        "prolific_pid",
        "experiment_pid",
        "prolific_status",
        "experiment_status",
    ]
    write_csv(args.output_dir / "analysis_ready_merged.csv", matched, merged_columns)
    write_csv(args.output_dir / "merge_discrepancies.csv", discrepancies, discrepancy_columns)
    issue_counts = Counter(row["issue"] for row in discrepancies)
    summary = {
        "matched": len(matched),
        "missing_in_experiment": issue_counts["missing_in_experiment"],
        "missing_in_prolific": issue_counts["missing_in_prolific"],
        "pid_mismatch": issue_counts["pid_mismatch"],
        "duplicate_session": issue_counts["duplicate_session"],
        "completion_code_mismatch": issue_counts["completion_code_mismatch"],
        "other_discrepancies": sum(issue_counts.values()) - sum(
            issue_counts[key]
            for key in [
                "missing_in_experiment",
                "missing_in_prolific",
                "pid_mismatch",
                "duplicate_session",
                "completion_code_mismatch",
            ]
        ),
    }
    (args.output_dir / "merge_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
