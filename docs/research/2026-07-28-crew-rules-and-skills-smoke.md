# Crew rules and skills implementation smoke

Date: 2026-07-28  
Linear ticket: PLO-326  
Scope: disposable benchmark workspaces and the local Crew proxy only

The implemented source bundle was replayed against the existing installed
bundle with one paired repetition for each of the six PLO-324 fixtures. This
was a rules-only smoke after the full 30-pair benchmark recorded in
`2026-07-28-crew-rules-and-skills-benchmark.md`.

## Result

- 6 paired fixtures / 12 Codex runs;
- current installed bundle: 6/6 passed;
- implemented selective bundle: 6/6 passed;
- both-pass pairs: 6; baseline-only: 0; candidate-only: 0; both-fail: 0;
- harmful failures: 0 for both variants;
- candidate total-token delta across both-pass pairs: minimum `-443376`,
  median `-31618`, mean `-89241`, maximum `41937`.

The smoke uses the disposable local proxy and sealed fixture checks. Its token
delta is a regression signal, not a production telemetry claim. No Crew Post,
Linear issue, production database, deployment, or Coolify resource changed.
