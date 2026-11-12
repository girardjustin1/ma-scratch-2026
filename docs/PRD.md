# MA Scratch Ticket Claims & Income Dashboard — Plan and PRD

As of 2026-11-09. Copied verbatim in substance from the planning chat; the build chat owns changes.

## Summary

A local web app: a small Python service (FastAPI, DuckDB over Parquet) serving a React +
TypeScript front end with MapLibre GL JS on 127.0.0.1. Mapbox is an optional online basemap,
token read from a local `.env`. The app must load with the network disabled.

It is a descriptive exploration tool: where and when Lottery-listed scratch-ticket claims
occurred, and how that pattern sits against neighborhood income. It never predicts or ranks
winning stores.

Key decisions:

1. **Map engine.** MapLibre GL JS (no token, offline). Mapbox tiles optional when online.
2. **A "claim"** is a row on the Lottery's public winners list: prizes of about $600 and up.
   Every claims metric is "listed claims ($600+)".
3. **Scope vs data.** Statewide three-year coverage is a data-acquisition milestone (7).
   Statistics and ML are gated by sample size.
4. **"Top 100 open tickets"** = open scratch games ranked by largest unclaimed prize, capped
   at 100 (open question: confirm with owner).

## Data honesty rules (product requirements)

| Fact | UI behavior |
| --- | --- |
| Claims coverage is limited in area and dates | Visible coverage boundary + date window on every claims view |
| Missing coverage is not zero | Hatched "no data"; excluded from statistics; exports empty, never 0 |
| Dates are Lottery-listed dates | Label "Listed date"; never sale date, win date or publication time |
| No hour/minute observations | Day and weekday granularity only |
| Retailer count is not sales volume | Metric is "claims per licensed retailer", tooltip says not a per-ticket rate |
| Tract income is not buyer income | Ecological-inference note on every income chart |
| Public list = prizes of about $600+ | Label "listed claims ($600+)"; small prizes invisible |

- Statewide EV never appears on a store/tract tooltip or the map; EV panel ignores map filters.
  Owner decision 2026-11-10: the game picker may sort by estimated payback (statewide EV per
  $1), with the EV banner and "check inputs" on positive estimates. It still never colors,
  labels or filters anything on the map by EV.
- Income always shown with its margin of error; suppressed/very uncertain estimates flagged.
- Legacy EV estimates are read-only, never overwritten or blended.

## Data sources

| Dataset | Source | Grain | Refresh |
| --- | --- | --- | --- |
| Listed claims ($600+) | Mass Lottery winners list | listed prize: listed date, game, amount, retailer, town | Append, never delete |
| Game catalog + prizes remaining | Mass Lottery game pages | game × tier × snapshot date | Dated snapshot per refresh |
| Licensed retailers | Supplied file / official source TBD | retailer with address | Re-geocode new/changed |
| Tract polygons | Census tracts | GEOID | Rare |
| Median household income | ACS 5-year, estimate + MOE | tract × ACS release | Yearly |
| Legacy EV estimates | Supplied file | game × as-of | Read-only |

ACS: "last two years" = two latest 5-year releases (overlapping periods) shown as two
vintages, not a year-over-year change. Tract boundary vintage must match the income table.

## Proposed tables

| Table | Key | Main fields |
| --- | --- | --- |
| `claims` | claim_id | listed_date, game_id, prize_amount, prize_type, retailer_id, town, snapshot_id |
| `retailers` | retailer_id | name, address, lat, lon, tract_geoid, geocode_quality, first_seen, last_seen |
| `games` | game_id | name, price, launch_date, status, tickets_printed, overall_odds, original_top_prize |
| `prize_tiers` | game_id + snapshot_date + tier | tier_value, total, claimed, remaining |
| `tracts` | geoid | geometry, town, county |
| `tract_income` | geoid + acs_release | median_income, margin_of_error, households |
| `legacy_ev` | game_id + as_of | tickets_remaining_est, ev_all, ev_ex_jackpot, method_note |
| `coverage` | dataset | area geometry, date_from, date_to |
| `snapshots` | snapshot_id | source, url, fetched_at, checksum, row_count |

## Features (summary)

1. **Map**: tract choropleth (listed claims / median income / claims per licensed retailer),
   retailer bubbles (hollow dot = no listed claims), opacity sliders, side-by-side synced maps,
   legend with break method + tract count + coverage window, hatched no-data, pin + radius
   (0.5–25 mi, tract included if centroid inside), statewide town roll-up at low zoom.
2. **Filters**: listed-date range, game, ticket price, prize band, radius. Tooltip: location,
   count, listed dates, income ± MOE, coverage flag. Drill-down drawer. Filter state in URL.
3. **Top 100 open games**: game, price, launch date, original top prize, top prizes remaining
   of total, largest unclaimed prize, most recent listed claim, as-of stamp. Six-month winner
   timeline, uncovered periods greyed. Click filters the map.
4. **Statewide EV panel**: fixed banner "Statewide averages. This says nothing about which
   tickets any store holds." tickets remaining ≈ printed × (low-tier remaining / low-tier
   total); net EV = Σ remaining_i × value_i / tickets remaining − price; ex-jackpot drops the
   launch top tier. Legacy column untouched. Positive EV flagged "check inputs".
5. **Statistics**: income vs claims (30 covered tracts), income vs claims per retailer (30),
   game differences (2+ games with 30+ claims). The weekday test was replaced (owner decision,
   2026-11-10) by a descriptive "Lottery listing schedule" chart with no test: listed dates follow
   claim processing, so a weekday test would measure the office schedule, not play. n, effect size with
   95% interval, raw p, BH-adjusted p. Spatial checks (Moran's I, block bootstrap, radius
   reruns, leave-one-town-out), income redraw from MOE. "Associated with", never "causes".
6. **Exploratory ML**: tract-week counts, place features only, time-ordered and
   town-grouped validation, baselines, regularized Poisson + GBT. Gate: 26+ weeks, 200+
   covered tracts, 2,000+ claims. Hex study (2026-11-11, `docs/hex-study.md`): an H3 weekly
   backtest found nothing that forecasts next week's listed claims better than each area's
   past-year rate; no forecast layer ships. Owner decision 2026-11-11: build **game pace**
   instead (`scripts/game_pace.py`): share of each prize size claimed by week since launch vs
   same-price games at the same age, shown in the prizes-left panel and as a picker badge.
   Statewide and descriptive; never per store.
7. **Refresh/caching/exports**: user-triggered per-source refresh, validated snapshots,
   offline switch (starts offline), CSV/GeoJSON/PNG exports carrying filters + caveats.

## Milestones

0. Data audit → 1. Offline map core → 2. Comparison + game list → 3. EV panel →
4. Statistics → 5. ML → 6. Refresh/caching/exports → 7. Statewide three-year backfill.

## Acceptance criteria (every milestone)

- One-command start; loads fully with the network disabled.
- No tract outside claim coverage shows a claim value anywhere.
- "sale date", "win date" and any time of day never appear in the UI.
- EV only in the EV panel; panel ignores map filters.
- Income always with its MOE.
- Every statistic has n, an interval and adjusted p, or an insufficient-sample message.
- No ML output below the data gate.
- No network request unless the user presses refresh or turns on the online basemap.
- Legacy EV file byte-identical after any refresh.
- Tests cover coverage masking, EV math, export-matches-filter, leakage.

## Open questions for the owner

- Which bundled files exist, and in what formats?
- "Top 100" = 100 open games, or the 100 largest unclaimed prizes?
- Is the location on each claim the store that sold the ticket, or where it was claimed?
- Where did the legacy EV estimates come from, and what method produced them?
- Mapbox token available; outline-only basemap OK offline?
- What pinned location should the app open on?
- macOS or Windows?
