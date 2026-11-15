# Hex study: a spatiotemporal "where next" model, tested as a backtest

Status: prototype study (PRD milestone 5, "Exploratory ML"). Script: `scripts/hex_study.py`.
Real-data results stay in `data/processed/hex_study/` (gitignored). This note gives
synthetic numbers only.

## Question

Given three years of listed claims located at their selling stores, can anything predict
where listed claims happen **next week** better than "the places that are already busy"?
The brief proposes H3 cells, time bins, lag and neighbor features, and Poisson or GBT
models served as probability surfaces. This study builds that pipeline and scores it
honestly before anything reaches the dashboard.

The project rule still applies: the dashboard never predicts or ranks winning stores. A
forecast layer would need an owner decision that changes that rule (see the last section).

## Pipeline

1. **Index.** Each store goes to an H3 cell at res 7 (about 5.2 km²) and res 8 (about
   0.74 km²). A claim inherits its store's cell. Coarser views use `cell_to_parent`.
2. **Bin.** Weekly bins, Monday to Sunday, using full weeks only. Daily bins are wrong for
   this data: listed dates follow the Lottery's claim processing, so a day measures the
   office schedule. There is no time of day.
3. **Features** for cell *c* and target week *T*, using only weeks before *T*:
   - **Volume:** retailers in the cell, the 52-week mean, the all-history mean, the
     week-of-year as sin/cos, and the statewide level over 4 weeks.
   - **Recency:** last week, the 4-week mean, the 13-week mean, and the neighbors' 4-week
     and 13-week sums (H3 ring 1).
4. **Models:**
   - Baselines: last week, last 4 weeks, and the 52-week mean (the volume baseline).
   - Regularized Poisson GLM.
   - LightGBM with a Poisson objective, trained twice: on volume features only, and on
     volume plus recency.
5. **Validation:**
   - Rolling origin over the last 52 target weeks, retraining every 13 weeks on all
     earlier weeks.
   - Spatially blocked: H3 res-5 regions are split into 5 folds, so a model is tested on
     regions it never trained on.
6. **Metrics:**
   - Poisson deviance skill against the volume baseline.
   - Brier score for P(≥1).
   - Calibration in deciles.
   - Capture at the top 1%, 5% and 10% of cells: the share of next week's claims that
     fall in them.
   - A hindsight ceiling: capture using each cell's true long-run rate.
   - A streak test: the Spearman correlation between a cell's recent excess and next
     week's excess. It uses split-half references, so the two sides share no noise.
7. **Positive control.** The synthetic generator builds two worlds:
   - **Null world:** counts are Poisson around fixed store volume.
   - **Hot world:** each store also has an AR(1) streak. The run asserts that the
     pipeline finds the recency signal in the hot world and not in the null world.

## Synthetic results (`--synthetic`)

| World, res 8 | Recency gain (GBT full − GBT volume, deviance skill) | Streak ρ (95% CI) |
| --- | --- | --- |
| Null: luck on top of volume | −0.0005 | +0.010 (+0.003 to +0.017) |
| Hot: real streaks | +0.0108 | +0.097 (+0.091 to +0.103) |

In both worlds, the top 10% of cells by any sensible model capture close to the hindsight
ceiling. Most of what can be ranked is volume.

## How to read a real run

- **Recency gain near the null value, and a streak ρ near the null value:** no area is
  "hot" or "due". The best forecast is the volume map the dashboard already shows (bubbles
  and claims per retailer).
- **Recency gain near the hot value, and it holds on held-out regions:** a real,
  transferable short-term signal. Check whether a 13-week drift explains it (store
  openings and closings, new games) before calling it anything else.
- **Capture equal to the volume baseline:** a ranked "high-probability zones" list would
  match the busiest-stores list.

## Dashboard payload (example)

The script writes `hex_r{res}_{source}.geojson`: a FeatureCollection of H3 polygons.

- **Descriptive properties (every run):** `h3`, `res`, `retailers`, `listed_claims`,
  `listed_claims_last13w`, `per_retailer`.
- **Forecast properties (synthetic runs only):** `expected_next_week`, `p_any_next_week`,
  and `interval90` (Poisson 5th to 95th percentile).

## Compute and storage (statewide)

| | res 7 | res 8 |
| --- | --- | --- |
| Cells with at least one store | about 1.4k | about 3.0k |
| Panel rows (130 target weeks) | about 180k | about 390k |
| Panel in memory | about 25 MB | about 53 MB |
| Full backtest on a laptop | about 1.5 min | about 1.5 min |
| Hex GeoJSON, descriptive | about 0.5 MB | about 1.2 MB |

Only cells with stores are kept, because a cell without stores can never have a listed
claim. An all-state grid at res 8 would be about 37k cells, mostly zero by construction.

## Monitoring, if a forecast ever ships

- Weekly drift in statewide listed claims, including the listing schedule.
- Calibration by decile on a rolling basis.
- Capture against the volume baseline. If the gap closes to zero, retire the layer.
- Retailer churn, since the retailer list is a current snapshot.

## Open questions for the owner

1. Should a forward-looking layer exist at all? It conflicts with "never predict or rank
   winning stores". The alternatives are a descriptive hex layer, and the study's findings
   shown in the Analysis tab.
2. Resolution: res 7 for statewide views and res 8 when zoomed in, or tracts only?
3. Should claims be weighted by prize size, or counted equally (as now)?
4. Retailer history: is there a dated retailer list, so the retailer-count feature does not
   leak?
5. Should the study re-run after each data refresh, with results kept per run?

## What shipped (2026-11-12)

No forecast layer. The owner chose a descriptive **Hexagons** option for the map instead
(Layers → Tracts | Hexagons): listed claims per H3 cell under the map's filters, sized by zoom
(res 6 ≈ 14 sq mi, res 7 ≈ 2 sq mi, res 8 ≈ 0.3 sq mi). Computed in the browser; nothing new is
written to disk.
