# AI Norm Pilot v1 launch checklist

Formal recruitment must remain closed until every item is confirmed.

- [ ] Deployed commit matches the tested and tagged release.
- [ ] `/health` reports `study1-ai-norm-pilot-v1`.
- [ ] Formal, Preview, QA, and Team Review use four distinct persistent directories.
- [ ] Formal Admin and Formal export contain Formal records only.
- [ ] Preview, QA, and Team Review isolation tests pass.
- [ ] All four Team Review cells complete end to end.
- [ ] Four opaque variants map one-to-one to IH, IM, SH, and SM.
- [ ] Taskflow allocations are 10 per cell (N = 40).
- [ ] `PROLIFIC_EXPECTED_STUDY_ID` has replaced `__PENDING__`.
- [ ] `PROLIFIC_COMPLETION_URL` has replaced `__PENDING__` with the real HTTPS Prolific URL.
- [ ] Public base URL has replaced `__PUBLIC_BASE_URL__` in the private Taskflow CSV.
- [ ] Completion behavior has been tested in Prolific Preview.
- [ ] Researcher confirms bonus currency and payment wording.
- [ ] `FORMAL_RECRUITMENT_ENABLED=true` is the final configuration-only change.
- [ ] A pre-launch backup and rollback command have been verified.

Do not create or publish a real Prolific Study from this repository automation.
