# Milestone 0 — Data audit

As of 2026-11-09. Every number here comes from `scripts/audit_m0.py` or the research notes in
`docs/research/`. Data files live in the gitignored `data/` folder.

## Summary

No data bundle was supplied, so this audit covers the data we fetched from official sources.
The three-year statewide claims window, income and tract polygons are complete. Two gaps
shape the build:

1. **Claims are located by town, not by address.** No statewide retailer list exists, so we
   built one by sweeping the Lottery's store locator. Coverage is proven for 100% of land, with
   7,039 retailers. 92.0% of scratch claims match a retailer, and 80.9% land in a
   Census-verified tract.
2. **The listed date behaves like a claim-processing date.** Mondays carry 23% of scratch rows
   and weekends 7.5%. The PRD's weekday test would measure the Lottery's office schedule, not
   buying patterns.

## Files

| File | Format | Rows | Window | Coverage |
| --- | --- | --- | --- | --- |
| `claims_all.parquet` | Parquet | 566,382 | 2023-11-09 → 2026-11-08 (1,096 days) | Statewide, 425 location values |
| `claims_scratch.parquet` | Parquet | 371,879 | same (1,095 days with scratch rows) | Statewide, 419 location values, 208 games |
| `claims_per_day.csv` | CSV | 1,096 | same | Daily totals |
| `retailers_ma.csv` | CSV | 7,039 | Swept 2026-11-10 | Statewide, 100% of land proven covered; 892 flagged geocodes |
| `claims_tract_ma.parquet` | Parquet | 342,081 | 2023-11-09 → 2026-11-08 | Scratch claims matched to a retailer; 300,741 with a verified tract |
| `retailers_pin_area.csv` | CSV | 1,806 | Swept 2026-11-10 | First sweep: 1,483 inside the 10 mi circle around the owner's pin |
| `claims_pin_area.parquet` | Parquet | 70,638 | 2023-11-09 → 2026-11-08 | Scratch claims matched to retailers in the 10 mi circle |
| `location_municipality_map.csv` | CSV | — | — | Place string → municipality (neighbourhoods rolled up) |
| `unresolved_retailer_matches.csv` | CSV | 216 | — | Never merged |
| `games_history.parquet` | Parquet | 12,059 | Catalog snapshots 2023-11-01 → 2026-10-02 (60 dates) | 238 games |
| `prize_tiers_history.parquet` | Parquet | 6,349 | 2025-01-06 → 2026-10-02 (42 dates) | 213 games; mostly top/secondary tiers |
| `ev_history.parquet` | Parquet | 89 | 2025-01-06 → 2026-09-24 (24 dates) | 57 games, full tables only |
| `tracts_ma.geojson` | GeoJSON | 1,613 polygons | 2020 tracts | Statewide (7 water-only tracts absent) |
| `tract_income.csv` | CSV | 3,240 | ACS 2019–2023 and 2020–2024 | 1,620 tracts × 2 releases |
| `tract_income_context.csv` | CSV | 3,240 | same | Per-capita income |
| `towns_ma.geojson` | GeoJSON | 351 | 2020 county subdivisions | Statewide |
| `town_income.csv` | CSV | 714 | same two releases | 357 town geoids |
| `tract_town_crosswalk.csv` | CSV | 1,713 | 2020 blocks | 1,620 tracts → 352 town names |

Raw responses, with manifests (URL, fetch time, status, sha256), are under `data/raw/`.

## Mapping to the PRD tables

| PRD table | Source | Status |
| --- | --- | --- |
| `claims` | `claims_scratch.parquet` | Mostly fits; see mismatches 1–5 |
| `retailers` | `retailers_pin_area.csv` | Pin area only; see 6–8 |
| `games` | latest catalog snapshot + per-game tables | Fits after parsing; see 9–10 |
| `prize_tiers` | current API + `prize_tiers_history.parquet` | Fits; history is spotty (11) |
| `tracts` | `tracts_ma.geojson` + crosswalk | Fits; vintages match (both 2020 tracts) |
| `tract_income` | `tract_income.csv` | Fits; MOE present for every computed estimate |
| `legacy_ev` | `ev_history.parquet` (Wayback) | Replaced by owner decision (12) |
| `coverage` | proposed below | New |
| `snapshots` | the three raw manifests | Fits; needs loading into one table |

## Mismatches with the PRD

**Claims**

1. **No claim id.** Build one from the source day file plus row order within the day.
2. **No retailer id.** Claims carry the retailer name and a place string only. Retailer ids
   come from name+town matching. In municipalities fully inside the circle, 94.0% of claims
   matched within 5 mi and 91.3% within 10 mi. Yearly rates 2023 → 2026 within 10 mi:
   87.7 / 88.8 / 92.2 / 94.2%. 571 scratch rows have no retailer name at all.
3. **No prize type.** The only annuity text in three years is 32 Lucky for Life rows (a draw
   game). Scratch amounts are plain dollars. Drop `prize_type` or default it to "as listed".
4. **"Town" is a place string, not a municipality.** It includes neighbourhoods (Dorchester,
   E Boston) and abbreviations (N Andover). It needs a roll-up table to the 351 towns before any
   town figure is shown.
5. **Threshold is strictly over $600** (minimum $601; scratch minimum $750). The PRD said
   "$600 and up". The UI now says "over $600".

Also in the claims data:

- 42,799 Online rows (from 2026-07-27) and 151,704 draw-game rows are excluded from the scratch
  table.
- 451 scratch rows (5 game slugs) have no catalog row.
- 8 days have 1–2 draw rows that the API counts but never serves.

**Retailers**

6. **No statewide list.** The Lottery's locator returns the 100 nearest stores only. The PRD
   assumed a supplied file. We built one with 179 locator calls.
7. **Current list only.** Stores that closed since 2023 are missing, so older claims match less
   often. Most of the 160 unresolved pairs with no candidate are likely closed stores.
8. **Lottery coordinates are unreliable.** Statewide, 892 of 7,039 retailers (12.7%) are flagged:
   they disagree with Census by more than 0.25 mi, or have no unique Census match. Use Census
   coordinates and tract, and leave flagged retailers unplaced. 41,340 matched claims are withheld
   from tracts for this reason.

**Games and prizes**

9. **Tickets printed** appears only as text in the per-game table ("approximately N tickets").
   It is parsed.
10. **Status values** are on sale or claims-only (with a claim deadline), not "closing". There
    are 103 on sale and 31 claims-only. Top 100 now offers all three views.
11. **Prize-tier history** exists only where the Wayback Machine captured it. Full tables cover
    2025-01 → 2026-09, with nothing for 2023-11 → 2024-12. The "TOP" label and annuity
    valuations are unreliable in some captures.
12. **Legacy EV**: no file exists. The owner chose Wayback-derived earlier estimates: 89 game ×
    date points, 8 flagged "check inputs".

**Statistics**

13. **The weekday test was replaced** (owner decision, 2026-11-10) by a descriptive listing-schedule chart. Scratch rows by weekday (Sun → Sat):
    13,352 / 86,460 / 69,175 / 59,195 / 59,085 / 70,009 / 14,603. The weekend share is capped by
    the $5,000 mobile-cashing limit. This is office processing, not play.

## Fields not placed in any PRD table

- **Claims:** `prize_amount_display` (duplicates the amount), `is_online` and `is_draw_game`
  (filter flags).
- **Retailers:** `locator_id`, `games`, the Keno and Wheel of Luck flags, `sells_draw`,
  `self_service`, `ada`, `times_seen`.
- **Prize tiers:** `prize_description`, `tier_odds`, `paid`, `tier_type`, `value_advertised`,
  `value_valuation`.
- **Games:** `catalog_tags`, `catalog_expiration_date` (the claim deadline; proposed as a new
  `games.claim_deadline`).
- **Income:** `cv`, `reliability`, the raw jam values, and per-capita income. `reliability` is
  proposed to drive the "very uncertain" flag.

## Proposed coverage manifest

| Dataset | Area | Dates | Notes |
| --- | --- | --- | --- |
| `claims_town` | Statewide, by municipality (after roll-up; Chestnut Hill, Devens, Bondsville ambiguous) | 2023-11-09 → 2026-11-08 | Scratch only, over $600, by the selling retailer's place. Gap days: 2024-04-28 (0 scratch rows), Thanksgivings, 2026-01-26 and 2026-02-23 (low, unexplained) |
| `claims_tract` | Statewide (retailer sweep proven complete over 100% of land) | same | Only claims matched to a Census-verified retailer: 80.9% of scratch claims (78.0% in 2023 rising to 83.1% in 2026). Counts are a floor, not a total. Lowest municipal match rates: Hadley 40.0%, East Longmeadow 61.9%, Springfield 64.0% |
| `retailers` | Statewide | as of 2026-11-10 | Current list; not historical |
| `tract_income` | Statewide | ACS 2019–2023, 2020–2024 | Two overlapping vintages, not a year-over-year change |
| `prize_tiers` | Statewide | current + Wayback spots 2025-01 → 2026-10 | Spot coverage |

## Decisions needed

- How to treat municipalities with low match rates (for example Hadley, Springfield). Options:
  flag them on the map, or show them by town only.
