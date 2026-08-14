# Study 1 AI Norm Pilot v1 deployment artifacts

The committed files contain placeholders only. Run `node scripts/generate-norm-pilot-private-config.js <private-output-directory>` to create high-entropy private values outside Git. The command does not print secrets.

The four generated opaque variants use internal labels A–D only in the private mapping file:

- A: `injunctive_honest`
- B: `injunctive_misreport`
- C: `subjective_honest`
- D: `subjective_misreport`

Formal recruitment is fail-closed while `FORMAL_RECRUITMENT_ENABLED=false` or either Prolific value remains `__PENDING__`.
