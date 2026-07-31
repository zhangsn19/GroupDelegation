#!/usr/bin/env python3
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def write_csv(path, rows):
    columns = list(rows[0])
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main():
    with tempfile.TemporaryDirectory(prefix="gd-merge-test-") as directory:
        root = Path(directory)
        prolific = root / "prolific.csv"
        experiment = root / "participants.csv"
        output = root / "output"
        write_csv(prolific, [
            {"study_id": "study-a", "session_id": "session-1", "participant_id": "pid-1", "status": "APPROVED"},
            {"study_id": "study-a", "session_id": "session-2", "participant_id": "pid-2", "status": "RETURNED"},
        ])
        write_csv(experiment, [
            {"record_key": "record-1", "prolific_study_id": "study-a", "prolific_session_id": "session-primary", "primary_prolific_session_id": "session-primary", "current_prolific_session_id": "session-1", "prolific_session_aliases_json": '["session-primary","session-1"]', "prolific_pid": "pid-1", "status": "completed"},
            {"record_key": "record-3", "prolific_study_id": "study-a", "prolific_session_id": "session-3", "primary_prolific_session_id": "session-3", "current_prolific_session_id": "session-3", "prolific_session_aliases_json": '["session-3"]', "prolific_pid": "pid-3", "status": "created"},
        ])
        subprocess.run([
            sys.executable,
            str(Path(__file__).with_name("merge_prolific_export.py")),
            "--prolific-csv", str(prolific),
            "--experiment-participants-csv", str(experiment),
            "--output-dir", str(output),
        ], check=True, capture_output=True, text=True)
        summary = json.loads((output / "merge_summary.json").read_text(encoding="utf-8"))
        assert summary["matched"] == 1
        assert summary["missing_in_experiment"] == 1
        assert summary["missing_in_prolific"] == 1
        assert (output / "analysis_ready_merged.csv").exists()
        assert (output / "merge_discrepancies.csv").exists()
        print("Prolific merge tool test passed")


if __name__ == "__main__":
    main()
