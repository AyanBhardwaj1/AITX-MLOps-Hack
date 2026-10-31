# Experiment Tracker

Evaluation types follow `integrity.md`. With no real users or ledgers in this sandbox, every run is `synthetic_proxy`: the ground truth is the generator's planted truth, and perturbations are external transforms.

| # | Pilot / run | Config | Eval type | Status | Output | Wall clock |
|---|---|---|---|---|---|---|
| P1a | I5 detector stress test, first drift model | 20 seeds × 2 noise × 9 settings; billing drift ±4 days independent per charge | synthetic_proxy | DONE, superseded | not kept (the file was overwritten; the numbers survive only in the session log, so they are **not cited**) | ~5 s |
| P1b | I5 detector stress test, realistic posting model + labelled harsh jitter | 20 seeds × 2 noise × 10 settings (`npm run stress-eval`) | synthetic_proxy | DONE | `sleep-research/runs/stress-eval.json`, `sleep-research/runs/stress-eval.md` | ~5 s |
