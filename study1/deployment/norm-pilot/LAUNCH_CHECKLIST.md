# AI Norm Pilot v1 launch checklist

Formal recruitment remains closed until every item is confirmed.

- [x] Protocol, condition map, stimuli, and 22-field posttest are frozen.
- [x] Participant, Review, Admin, and Taskflow URLs use `https://normpilot.8-216-54-76.sslip.io`.
- [x] Node binds only to `127.0.0.1:5002`; HTTP redirects to HTTPS.
- [x] Admin uses password login and an HttpOnly, Secure, SameSite=Strict cookie.
- [x] Formal, Preview, QA, and Team Review use four distinct stores and exports.
- [x] Four opaque variants are frozen in the Git-external private artifact.
- [x] Taskflow allocation is 10 per cell, N=40.
- [x] ZIP and seven individual exports share the same exporter.
- [x] `surveys.csv` contains 4 pretest, 22 posttest, and 3 demographics fields.
- [x] Rollback assets and instructions are retained.
- [ ] Research team resolves the inherited `RESEARCH_TEAM_DECISION_REQUIRED` bonus currency semantic.
- [ ] Fill `PROLIFIC_EXPECTED_STUDY_ID` in the private final-values file.
- [ ] Fill `PROLIFIC_COMPLETION_URL` in the private final-values file.
- [ ] Complete the Prolific Preview checklist with the real Draft values.
- [ ] Set `FORMAL_RECRUITMENT_ENABLED=true` only after all checks pass.

Do not regenerate Taskflow URLs or opaque variants during launch.
