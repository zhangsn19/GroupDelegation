const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = process.env.STUDY2_HANDOFF_ROOT || "D:\\GroupDeceptionPrivate\\Study2-HumanAI-v1";
const csvPath = path.join(root, "prolific", "Study2_HumanAI_Taskflow_pilot_READY.csv");
const mappingPath = path.join(root, "prolific", "Study2_HumanAI_Taskflow_variant_mapping_PRIVATE.txt");
const openPath = path.join(root, "00_OPEN_ME.html");
for (const required of [root, csvPath, mappingPath, openPath]) assert(fs.existsSync(required), `Missing private handoff: ${required}`);

const rows = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
assert.strictEqual(rows.length, 6);
const tokens = rows.map((row) => {
  const match = row.match(/^https:\/\/study2\.8-216-54-76\.sslip\.io\/\?variant=([A-Za-z0-9_-]{32,256}),1$/);
  assert(match, `Invalid Taskflow row: ${row}`);
  return match[1];
});
assert.strictEqual(new Set(tokens).size, 6);
assert(!/PROLIFIC_PID|STUDY_ID|SESSION_ID|preview=true/i.test(rows.join("\n")));

const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
assert.deepStrictEqual(new Set(Object.keys(mapping)), new Set(tokens));
assert.deepStrictEqual(new Set(Object.values(mapping).map((cell) => cell.variant_id)), new Set([
  "human_hidden", "human_honest", "human_dishonest", "ai_hidden", "ai_honest", "ai_dishonest"
]));
const open = fs.readFileSync(openPath, "utf8");
for (const required of ["/review", "/qa-preview", "/admin.html", "/health", "group-deception-prolific-study2", "5005", "study2-human-ai-v1"]) assert(open.includes(required), required);
console.log("Study2 private handoff passed: six opaque rows, no manual Prolific placeholders, complete mapping and launch page.");
