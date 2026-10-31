Detector stress test: 20 seeds × 2 noise levels per setting. Cells are precision / recall per detector (n/a = nothing planted and nothing found).

| Setting | Runs | duplicate_tools | price_creep | zombie | duplicate_charge | $ recall |
|---|---|---|---|---|---|---|
| baseline | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| billing_day_drift | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| harsh_day_jitter | 40 | 100% / 88% | 100% / 98% | 100% / 93% | 100% / 100% | 93% |
| vendor_rename | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| refunds | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| shared_card | 40 | 100% / 100% | 100% / 100% | n/a / n/a | 100% / 100% | 100% |
| seat_cards | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| annual_billing | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| usage_priced | 40 | 100% / 100% | 43% / 100% | 100% / 100% | 100% / 100% | 100% |
| split_workspaces | 40 | 100% / 100% | 100% / 100% | n/a / 0% | 4% / 100% | 84% |
| refunded_double_charge | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 0% / n/a | 100% |
| unaliased_rename | 40 | 100% / 100% | 0% / 0% | 100% / 100% | 100% / 100% | 55% |
| short_history | 40 | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% |
| combined | 40 | 100% / 100% | 0% / 0% | n/a / 0% | 0% / n/a | 37% |
