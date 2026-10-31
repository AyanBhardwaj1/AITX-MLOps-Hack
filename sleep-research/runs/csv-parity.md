CSV vs API parity: 20 seeds × 2 noise levels. Detector cells are precision / recall vs planted truth; runway delta is |CSV − API| in months (median / max); burn delta is the median signed difference in net burn.

| Layout | duplicate_tools | price_creep | zombie | duplicate_charge | Runway Δ mo (median / max) | Net burn Δ | Rows skipped |
|---|---|---|---|---|---|---|---|
| rho_csv | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 0.00 / 0.00 | 0.0% | 0 |
| mercury_csv | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 0.00 / 0.00 | 0.0% | 0 |
| generic_all_accounts | 100% / 100% | 100% / 100% | n/a / 0% | 100% / 100% | 0.00 / 0.00 | 0.0% | 0 |
| generic_checking_only | n/a / 0% | n/a / 0% | n/a / 0% | n/a / 0% | 0.00 / 0.05 | 0.0% | 0 |
| checking_plus_card_files | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 0.00 / 0.00 | 0.0% | 0 |
| mercury_checking_named_debits | n/a / 0% | n/a / 0% | 0% / 0% | n/a / 0% | 0.00 / 0.05 | 0.0% | 0 |
| one_account_two_date_ranges | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 0.00 / 0.00 | 0.0% | 0 |
CSV vs API findings on perturbed ledgers (10 seeds, clean): share of runs where the CSV path finds exactly the same set of findings as the API path (generic layouts compared without idle-card findings, which need a cardholder column); max runway Δ in months.

| Setting | rho_csv | mercury_csv | generic_all_accounts | generic_checking_only | checking_plus_card_files | mercury_checking_named_debits | one_account_two_date_ranges |
|---|---|---|---|---|---|---|---|
| billing_day_drift | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| harsh_day_jitter | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| vendor_rename | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| refunds | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.17) | 100% (Δ 0.00) | 0% (Δ 0.17) | 100% (Δ 0.00) |
| shared_card | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| seat_cards | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) |
| annual_billing | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.16) | 100% (Δ 0.00) | 0% (Δ 0.16) | 100% (Δ 0.00) |
| usage_priced | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) |
| split_workspaces | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) |
| refunded_double_charge | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| unaliased_rename | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| short_history | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| heldout:usage_mild_hubspot_slack_notion | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| heldout:usage_heavy_gworkspace_github_loom | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.07) | 100% (Δ 0.00) | 0% (Δ 0.07) | 100% (Δ 0.00) |
| heldout:usage_noise_on_datadog_step | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.09) | 100% (Δ 0.00) | 0% (Δ 0.09) | 100% (Δ 0.00) |
| heldout:real_step_on_flat_vendor | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) |
| heldout:sub_floor_step_on_small_vendor | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) | 0% (Δ 0.04) | 100% (Δ 0.00) |
| heldout:seat_steps_slack | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) | 0% (Δ 0.08) | 100% (Δ 0.00) |
| heldout:split_ws_notion_daniel | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) |
| heldout:split_ws_recent_start_linear | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| heldout:split_ws_slack_different_amount | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.07) | 100% (Δ 0.00) | 0% (Δ 0.07) | 100% (Δ 0.00) |
| heldout:split_ws_intercom_next_day | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.10) | 100% (Δ 0.00) | 0% (Δ 0.10) | 100% (Δ 0.00) |
| heldout:split_ws_idle_card_figma | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) | 0% (Δ 0.06) | 100% (Δ 0.00) |
| heldout:refund_next_day | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| heldout:refund_20_days_across_month_end | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| heldout:refund_different_descriptor | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
| heldout:refund_partial_half | 100% (Δ 0.00) | 100% (Δ 0.00) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) | 0% (Δ 0.05) | 100% (Δ 0.00) |
