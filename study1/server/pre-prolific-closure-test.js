const assert = require("assert");
const fs = require("fs");
const path = require("path");
const norm = require("../config/ai-norm-pilot");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const survey = read("public/js/survey.js");
const app = read("public/js/app.js");
const admin = read("public/admin-scope.html");
const login = read("public/admin-login.html");
const server = read("server/index.js");

for (const heading of [
  "YOUR IMPRESSIONS OF THE AI MEMBERS",
  "HOW THE AI MESSAGES AFFECTED YOUR DECISIONS",
  "YOUR FEELINGS ABOUT YOUR REPORTS",
  "YOUR DECISION AND RESPONSIBILITY",
  "TASK AND MESSAGE CHECKS",
  "ABOUT THE OTHER GROUP MEMBERS",
  "FINAL RESPONSE",
]) assert(survey.includes(heading), heading);
assert.strictEqual(norm.POSTTEST_ITEMS.length, 22);
assert.strictEqual(norm.POSTTEST_ITEMS.find((item) => item.id === "open_norm_interpretation").required, true);
assert.strictEqual(norm.POSTTEST_ITEMS.find((item) => item.id === "identity_confidence").minLabel, "Not at all confident");
assert(app.includes("You will join a simulated work group with four AI members and complete an individual reporting task."));
assert(app.includes("Read the AI members' messages before completing your private report."));
for (const stimulus of Object.values(norm.STIMULI)) assert.strictEqual((read("config/ai-norm-pilot.js").match(new RegExp(stimulus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
for (const forbidden of ["prompt(\"Admin token\")", "sessionStorage", "localStorage", "x-admin-token"]) assert(!admin.includes(forbidden), forbidden);
for (const required of ["Complete scope ZIP", "participants.csv", "study1_rounds.csv", "surveys.csv", "bonus_payments.csv", "raw_sessions.ndjson", "export_metadata.json", "cell_summary.csv", "Data Integrity", "Participant detail"]) assert(admin.includes(required), required);
for (const required of ["type=\"password\"", "/api/admin/login"]) assert(login.includes(required), required);
for (const required of ["HttpOnly", "SameSite=Strict", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "HOST || undefined", "NORM_EXPORT_FILES"]) assert(server.includes(required), required);
console.log("Pre-Prolific closure assertions passed: headings, frozen stimuli, participant wording, no-token Admin, complete exports, auth cookie, and bind host.");
