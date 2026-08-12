const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { activeCells, STUDY_VERSION, PROTOCOL_VERSION, IDENTITY_MANIPULATION_VERSION, CONDITION_MAP_VERSION } = require("../config/human-ai-protocol");

const handoffRoot = process.env.STUDY2_HANDOFF_ROOT || "D:\\GroupDeceptionPrivate\\Study2-HumanAI-v1";
const prolificDir = path.join(handoffRoot, "prolific");
const csvPath = path.join(prolificDir, "Study2_HumanAI_Taskflow_pilot_READY.csv");
const mappingPath = path.join(prolificDir, "Study2_HumanAI_Taskflow_variant_mapping_PRIVATE.txt");
const openPath = path.join(handoffRoot, "00_OPEN_ME.html");
const host = "https://study2.8-216-54-76.sslip.io";

fs.mkdirSync(prolificDir, { recursive: true });

function safeOpaqueToken() {
  for (;;) {
    const token = crypto.randomBytes(32).toString("base64url");
    if (!/human|ai|hidden|honest|dishonest|condition/i.test(token)) return token;
  }
}

let mapping = null;
if (fs.existsSync(mappingPath)) {
  mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
} else {
  mapping = Object.fromEntries(activeCells().map((cell) => [safeOpaqueToken(), cell]));
}

const expectedCells = new Set(activeCells().map((cell) => `${cell.peer_identity}|${cell.condition}|${cell.variant_id}`));
assert.strictEqual(Object.keys(mapping).length, 6, "Private mapping must have exactly six tokens");
assert.deepStrictEqual(new Set(Object.values(mapping).map((cell) => `${cell.peer_identity}|${cell.condition}|${cell.variant_id}`)), expectedCells);
for (const token of Object.keys(mapping)) {
  assert.match(token, /^[A-Za-z0-9_-]{32,256}$/);
  assert(!/human|ai|hidden|honest|dishonest|condition/i.test(token));
}

const csv = `${Object.keys(mapping).map((token) => `${host}/?variant=${token},1`).join("\r\n")}\r\n`;
assert(!/PROLIFIC_PID|STUDY_ID|SESSION_ID|preview=true/i.test(csv));
fs.writeFileSync(csvPath, csv, "utf8");
fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

const commit = process.env.GIT_COMMIT || "PENDING_COMMIT";
const release = process.env.RELEASE_ID || "PENDING_RELEASE";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Study2 Human–AI v1 Private Handoff</title><style>body{font:16px/1.5 system-ui;max-width:920px;margin:40px auto;padding:0 24px;color:#172033}code{background:#eef2f7;padding:2px 5px}li{margin:7px 0}</style></head><body><h1>Study2 Human–AI v1</h1><p>Private pre-Prolific handoff. Do not commit this directory.</p><h2>Public routes</h2><ul><li><a href="${host}/review">Team Review</a></li><li><a href="${host}/qa-preview">QA Preview</a></li><li><a href="${host}/admin.html">Admin</a></li><li><a href="${host}/health">Health</a></li></ul><h2>Deployment</h2><ul><li>Branch: <code>feature/study2-human-ai-v1</code></li><li>Commit: <code>${commit}</code></li><li>Release: <code>${release}</code></li><li>Service: <code>group-deception-prolific-study2</code></li><li>Port: <code>5005</code></li><li>EnvironmentFile: <code>/etc/group-deception/prolific-study2.env</code></li></ul><h2>Storage</h2><ul><li>Recruitment: <code>/opt/group-deception/data/study2-human-ai-recruitment/sessions</code></li><li>Internal: <code>/opt/group-deception/data/study2-human-ai-internal/sessions</code></li><li>Historical: verify the preserved previous Study2 DATA_DIR on the server</li></ul><h2>Protocol</h2><ul><li>Study/version: <code>${STUDY_VERSION}</code></li><li>Protocol: <code>${PROTOCOL_VERSION}</code></li><li>Identity: <code>${IDENTITY_MANIPULATION_VERSION}</code></li><li>Condition map: <code>${CONDITION_MAP_VERSION}</code></li></ul><h2>Private Prolific files</h2><ul><li><a href="file:///D:/GroupDeceptionPrivate/Study2-HumanAI-v1/prolific/Study2_HumanAI_Taskflow_pilot_READY.csv">Taskflow CSV</a></li><li><a href="file:///D:/GroupDeceptionPrivate/Study2-HumanAI-v1/prolific/Study2_HumanAI_Taskflow_variant_mapping_PRIVATE.txt">Six-token mapping</a></li></ul><p>Formal recruitment remains disabled until the real Study ID and Completion URL are supplied.</p></body></html>\n`;
fs.writeFileSync(openPath, html, "utf8");

console.log(JSON.stringify({ handoff_root: handoffRoot, csv_path: csvPath, mapping_path: mappingPath, rows: 6 }, null, 2));
