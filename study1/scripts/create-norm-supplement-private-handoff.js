"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const protocol = require("../config/norm-supplement-protocol");

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { row.push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function pidSet(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const candidates = ["prolific_pid", "participant_id", "prolific_id"];
  const column = candidates.find((name) => rows.some((row) => String(row[name] || "").trim()));
  if (!column) throw new Error(`No participant ID column found in ${path.basename(filePath)}`);
  return new Set(rows.map((row) => String(row[column] || "").trim()).filter(Boolean));
}

function ensureEmptyOutput(outputDir) {
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length) {
    throw new Error(`Refusing to overwrite non-empty private handoff directory: ${outputDir}`);
  }
  fs.mkdirSync(path.join(outputDir, "prolific"), { recursive: true });
}

const outputDir = path.resolve(arg("output-dir"));
const humanAiFile = path.resolve(arg("human-ai-participants"));
const normFile = path.resolve(arg("norm-participants"));
const hostname = arg("hostname") || "normsupplement.8-216-54-76.sslip.io";
if (!outputDir || !humanAiFile || !normFile) throw new Error("--output-dir, --human-ai-participants, and --norm-participants are required");
ensureEmptyOutput(outputDir);

const humanAiPids = pidSet(humanAiFile);
const normPids = pidSet(normFile);
const union = new Set([...humanAiPids, ...normPids]);
const overlap = [...humanAiPids].filter((pid) => normPids.has(pid)).length;
const hashes = [...union].map((pid) => crypto.createHash("sha256").update(pid.trim().toLowerCase()).digest("hex")).sort();
const cells = protocol.activeCells();
const tokens = cells.map(() => crypto.randomBytes(32).toString("base64url"));
const mapping = Object.fromEntries(cells.map((cell, index) => [tokens[index], {
  variant_id: cell.analysis_condition,
  condition: cell.source_condition,
  source_condition: cell.source_condition,
  analysis_condition: cell.analysis_condition,
  peer_identity: "ai",
}]));
const prolificDir = path.join(outputDir, "prolific");
const write = (name, value) => fs.writeFileSync(path.join(prolificDir, name), value, { encoding: "utf8", mode: 0o600 });

write("NormSupplement_Taskflow_READY.csv", [
  "name,url,total_available_places",
  ...cells.map((cell, index) => `${cell.analysis_condition},https://${hostname}/en/?variant=${tokens[index]},30`),
].join("\n") + "\n");
write("NormSupplement_variant_mapping_PRIVATE.json", `${JSON.stringify(mapping, null, 2)}\n`);
write("norm-supplement.pid-denylist.sha256", `${hashes.join("\n")}\n`);
write("PID_DENYLIST_AUDIT.json", `${JSON.stringify({
  generated_at_utc: new Date().toISOString(),
  normalization: "trim + lowercase + SHA-256",
  source_counts: { human_ai_arrived: humanAiPids.size, norm_arrived: normPids.size },
  overlap_count: overlap,
  union_count: union.size,
  raw_pid_written: false,
  earlier_pilot_sources: {
    status: "BLOCKED_PENDING_SOURCE_IDENTIFICATION",
    blocker: "No canonical earlier-pilot arrived-PID export was identified; do not guess or silently broaden the denylist.",
  },
}, null, 2)}\n`);
write("norm-supplement.private.env.template", [
  `STUDY_VERSION=${protocol.STUDY_VERSION}`,
  `PROTOCOL_VERSION=${protocol.PROTOCOL_VERSION}`,
  `SOURCE_TASK_PROTOCOL=${protocol.SOURCE_TASK_PROTOCOL}`,
  `SOURCE_TASK_COMMIT=${protocol.SOURCE_TASK_COMMIT}`,
  `CONDITION_MAP_VERSION=${protocol.CONDITION_MAP_VERSION}`,
  `POSTTEST_SCHEMA_VERSION=${protocol.POSTTEST_SCHEMA_VERSION}`,
  "FORMAL_RECRUITMENT_ENABLED=false",
  "ASSIGNMENT_MODE=prolific_taskflow",
  "PROLIFIC_PREVIEW_MODE=true",
  "PROLIFIC_EXPECTED_STUDY_ID=__UNCONFIGURED_PHASE_C__",
  "PROLIFIC_COMPLETION_URL=__UNCONFIGURED_PHASE_C__",
  `PROLIFIC_VARIANT_MAP_JSON=${JSON.stringify(mapping)}`,
  "SERVER_RECORD_SECRET=__GENERATE_ON_SERVER__",
  "PID_DENYLIST_FILE=/etc/group-deception/norm-supplement-v1-denylist.sha256",
  "",
].join("\n"));
write("LAUNCH_CHECKLIST.md", `# Norm Supplement launch checklist (private)\n\n- [ ] Resolve the earlier-pilot PID-source blocker recorded in PID_DENYLIST_AUDIT.json.\n- [ ] Configure a new Prolific Study ID; do not reuse an earlier study.\n- [ ] Configure a new Prolific completion destination; do not reuse an earlier completion URL/code.\n- [ ] Configure Prolific previous-study exclusions in addition to the server denylist.\n- [ ] Verify exactly three Taskflow rows, each with allocation 30.\n- [ ] Run Preview for all three variants and confirm records enter Preview only.\n- [ ] Confirm Formal, Preview, QA, and Team Review physical directories are distinct.\n- [ ] Re-run complete QA and Team Review flows for all three cells.\n- [ ] Verify HTTPS, health, Admin, exports, and protected services on 5002/5004/5005.\n- [ ] Only then set FORMAL_RECRUITMENT_ENABLED=true and restart the service.\n`);
write("ROLLBACK.md", `# Rollback\n\n1. Set FORMAL_RECRUITMENT_ENABLED=false and restart group-deception-norm-supplement.\n2. Disable the new Nginx site and restore the saved Nginx state from the timestamped replacement backup.\n3. Stop and disable group-deception-norm-supplement.\n4. Restore the old group-deception-staging-study2 unit and effective environment from the timestamped backup.\n5. Re-enable and start group-deception-staging-study2, then verify its WorkingDirectory, DATA_DIR, listener, and health.\n6. Do not delete or reuse either system's data directories during rollback.\n`);
fs.writeFileSync(path.join(outputDir, "README_PRIVATE.md"), `# Norm Supplement private handoff\n\nThis directory is intentionally outside Git. It contains three opaque Taskflow tokens and a SHA-256-only participant denylist. It contains no real Prolific Study ID or completion destination. Formal recruitment remains disabled.\n`, { encoding: "utf8", mode: 0o600 });

console.log(JSON.stringify({ output_dir: outputDir, taskflow_rows: cells.length, allocations: cells.map(() => 30), denylist_union_count: union.size, raw_pid_written: false }));
