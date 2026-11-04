# Trend-aware cash range: how it was chosen and how well it holds

The top next step from CLAIMS.md C6. The old band (past month-to-month swings only) held realized cash far less often than an 80% band should, and missed in one direction whenever burn was trending.

## Model (src/lib/finance/forecast.ts, src/lib/finance/trend.ts)

- Fit a least-squares line to monthly net burn over the **last 6 complete months**.
- If a single step (two flat levels) fits at least twice as well as the line, burn changed level once, so no trend is applied (the same rule the price-increase detector uses).
- Trust the slope only when it is at least **2 standard errors** from zero; otherwise the middle doesn't move, but the slope's uncertainty still widens the range.
- Each of 1,000 seeded paths draws its own slope (from the slope's standard error) and level (today's 3-month average and its error), then adds month-to-month noise resampled from what the line leaves unexplained.
- The trend runs at most **12 months**, then burn holds level. This is an assumption: the backtest only checks 3 and 6 months.
- Damping 1 (none). The straight "at today's burn" line and the hero runway number are unchanged.

## Procedure

Acceptance criteria were written down before any run: on held-out seeds, the 80% band holds realized cash 60–95% of the time for the *as generated* and *hiring ramp* profiles at 3 and 6 months, and the median band width at 6 months is at most 30% of P50. Revenue-drop and one-off-bill profiles are shocks after the forecast date and are reported only.

Seed sets (20 seeds × 2 noise levels × 5 origins = 200 forecasts per row): dev = seeds 0–19, holdout = 20–39, holdout2 = 40–59 (all `i*37+1`).

1. **Dev grid** (first model, before the significance and horizon rules). Inside-band rates, as generated 3/6 mo and hiring ramp 3/6 mo:
   | Window | Damping | As generated | Hiring ramp |
   |---|---|---|---|
   | 12 | 1.0 | 72% / 65% | 37% / 25% |
   | 12 | 0.9 | 71% / 64% | 27% / 10% |
   | 12 | 0.8 | 70% / 65% | 20% / 3% |
   | 12 | 0.7 | 71% / 65% | 14% / 1% |
   | 9 | 1.0 | 72% / 64% | 56% / 54% |
   | 9 | 0.9 | 71% / 65% | 43% / 24% |
   | 6 | 1.0 | 68% / 66% | 64% / 65% |
   | 6 | 0.95 | 67% / 65% | 60% / 58% |
   | 6 | 0.9 | 68% / 65% | 51% / 46% |
   Window 6, damping 1 was the only setting passing on dev.
2. **Holdout, run once** with that setting: as generated 59% / 61%, hiring ramp 55% / 55%. **The criterion was not met** (three of four cells under 60%). The old model on the same seeds: 49% / 36% and 13% / 0%.
3. A unit test then showed a real defect, not a coverage one: on a noisy, flat history an insignificant slope carried for 240 months made the median path never run out of cash. The significance and 12-month rules fix that. Because the model changed after the holdout was seen, the holdout is spent; the final model was checked once on a fresh set, holdout2.
4. **Holdout2, run once, final model** (`runway-backtest-trend-d1-w6-holdout2.md`), against the old model on the same seeds (`runway-backtest-swings-holdout2.md`):

| Profile | Horizon | Old: inside band | New: inside band | New: below P10 | New: above P90 | New: median width |
|---|---|---|---|---|---|---|
| as generated | 3 mo | 52% | 69% | 8% | 24% | 2.4% |
| as generated | 6 mo | 43% | 73% | 9% | 19% | 7.1% |
| hiring ramp | 3 mo | 7% | 54% | 42% | 5% | 3.2% |
| hiring ramp | 6 mo | 0% | 57% | 39% | 4% | 12.7% |
| revenue drop | 3 mo | 45% | 60% | 22% | 18% | 2.4% |
| revenue drop | 6 mo | 31% | 57% | 39% | 4% | 7.1% |
| one-off bill | 3 mo | 42% | 55% | 26% | 20% | 2.4% |
| one-off bill | 6 mo | 6% | 41% | 55% | 5% | 7.1% |

## Conclusion

- Better than the old band on every profile and horizon tested, on seeds never used to choose it.
- Meets the 60% floor for a company whose burn follows its recent path; **does not** for a hiring ramp (54–57%: it still under-reads an accelerating payroll), and is still short of a calibrated 80% everywhere.
- The product says so: the range is labelled "Range with trend", the chart note says it is narrower than reality, and Copilot is told p10 is not a worst case.

Limits: one generated company shape (Taco Robotics), synthetic perturbations written by the same author as the model, and the 200 forecasts per row are 40 runs × 5 overlapping origins, not independent. The dev-grid files for windows 6 and 9 come from the first model; `runway-backtest-trend-d1-w6-dev.md` and `-holdout.md` were re-run with the final model and no longer show the numbers in steps 1–2, which are recorded here.

Next step: calibrate the width (e.g. scale it so backtest coverage reaches 80% on dev, confirm on a fresh set), and model payroll changes from hiring plans rather than history.

## Calibration (2026-11-04)

The fitted uncertainty from six months of history was too small, so every source of it (slope, level, monthly noise) is now multiplied by one factor, `DEFAULT_UNCERTAINTY_SCALE`. Criteria written before any run: on a fresh seed set, coverage 70–90% for *as generated* and *hiring ramp* at 3 and 6 months, median width at 6 months ≤ 30% of P50.

Dev seeds, inside-band rates (as generated 3/6 mo · hiring ramp 3/6 mo · hiring width at 6 mo):

| Scale | As generated | Hiring ramp | Width |
|---|---|---|---|
| 1.5 | 84% / 87% | 73% / 71% | 19.5% |
| 2 | 91% / 93% | 83% / 81% | 26.3% |
| 2.5 | 95% / 96% | 88% / 87% | 32.4% |
| 3 | 97% / 97% | 90% / 89% | 39.3% |

1.5 was the only scale inside 70–90% on dev. **Holdout3 (seeds 60–79, run once)**, `runway-backtest-trend-d1-w6-s1.5-holdout3.md`:

| Profile | 3 mo | 6 mo | Median width at 6 mo |
|---|---|---|---|
| as generated | 80% | 82% | 9.8% |
| hiring ramp | 73% | **68%** | 18.3% |
| revenue drop | 79% | 77% | 9.8% |
| one-off bill | 65% | 67% | 9.8% |

Three of four criterion cells pass; hiring ramp at 6 months misses the 70% floor by 2 points (misses fall below P10: the model still under-reads an accelerating payroll). On the same seeds the uncalibrated trend model held 54–70% and the original swings band 1–51% (`runway-backtest-trend-d1-w6-holdout3.md`, `runway-backtest-swings-holdout3.md`). Shipped as the default with that result stated.
