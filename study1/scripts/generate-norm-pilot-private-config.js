const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const norm = require("../config/ai-norm-pilot");

const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const releaseCommit = String(process.argv[3] || "__FINAL_GIT_COMMIT__");
if (!outputDir) throw new Error("Provide a private output directory outside Git");
fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const opaque = () => crypto.randomBytes(32).toString("base64url");
const tokens = Object.fromEntries(norm.CONDITIONS.map((condition) => [condition, opaque()]));
const descriptors = Object.fromEntries(norm.CONDITIONS.map((condition) => {
  const factor = norm.CONDITION_MAP[condition];
  return [tokens[condition], { variant_id: factor.stimulus_id, condition, peer_identity: "ai", protocol_version: norm.PROTOCOL_VERSION, norm_type: factor.norm_type, norm_valence: factor.norm_valence }];
}));
const env = [
  "NODE_ENV=production", "PORT=5002", "ASSIGNMENT_MODE=prolific_taskflow",
  `PROTOCOL_VERSION=${norm.PROTOCOL_VERSION}`, `STUDY_VERSION=${norm.STUDY_VERSION}`,
  "FORMAL_RECRUITMENT_ENABLED=false", "PROLIFIC_PREVIEW_MODE=true", "ALLOW_PREVIEW=true", "ALLOW_QA_PREVIEW=true", "ALLOW_TEAM_REVIEW=true",
  "REQUIRE_PARTICIPANT_ID=false", "DEBUG_LINKS=false",
  "FORMAL_DATA_DIR=/var/lib/group-deception/study1-ai-norm-pilot-v1/formal/sessions",
  "PREVIEW_DATA_DIR=/var/lib/group-deception/study1-ai-norm-pilot-v1/preview/sessions",
  "QA_DATA_DIR=/var/lib/group-deception/study1-ai-norm-pilot-v1/qa/sessions",
  "TEAM_REVIEW_DATA_DIR=/var/lib/group-deception/study1-ai-norm-pilot-v1/team-review/sessions",
  "PROLIFIC_EXPECTED_STUDY_ID=__PENDING__", "PROLIFIC_COMPLETION_URL=__PENDING__",
  `PROLIFIC_VARIANT_MAP_JSON=${JSON.stringify(descriptors)}`,
  `ADMIN_TOKEN=${crypto.randomBytes(32).toString("hex")}`,
  `SERVER_RECORD_SECRET=${crypto.randomBytes(32).toString("hex")}`,
  "STUDY_CONTACT_EMAIL=zsn23@mails.tsinghua.edu.cn", "BONUS_CURRENCY=GBP", "BONUS_DISPLAY_LABEL=Task bonus",
  `GIT_COMMIT=${releaseCommit}`, `RELEASE_ID=${releaseCommit}`, "",
].join("\n");
const taskflow = ["url,allocation", ...norm.CONDITIONS.map((condition) => `__PUBLIC_BASE_URL__/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&variant=${tokens[condition]},10`), ""].join("\n");
fs.writeFileSync(path.join(outputDir, "study1-ai-norm-pilot-v1.private.env"), env, { encoding: "utf8", mode: 0o600, flag: "wx" });
fs.writeFileSync(path.join(outputDir, "taskflow-private.csv"), taskflow, { encoding: "utf8", mode: 0o600, flag: "wx" });
fs.writeFileSync(path.join(outputDir, "variant-labels-private.json"), `${JSON.stringify(Object.fromEntries(norm.CONDITIONS.map((condition, index) => [String.fromCharCode(65 + index), { condition, token: tokens[condition] }])), null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
