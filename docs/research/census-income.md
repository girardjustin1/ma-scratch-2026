# Census tract income and boundaries for Massachusetts

Research note, 2026-11-09 (downloads ran 2026-11-10 01:16 UTC). Covers PRD data sources
"Tract polygons" and "Median household income". All sources are census.gov / www2.census.gov.
Nothing under `data/` is committed.

## 1. Which ACS 5-year vintages are released

Checked on census.gov on 2026-11-09. I did not assume the dates.

| Release | Survey years | Dollars | Public release | Evidence |
| --- | --- | --- | --- | --- |
| 2024 ACS 5-year | 2020–2024 | 2024 dollars | **January 29, 2026** (moved from the usual December date) | 2024 release schedule page; summary-file `.dat` Last-Modified 2026-01-29 |
| 2023 ACS 5-year | 2019–2023 | 2023 dollars | December 12, 2024 | 2023 release schedule page |
| 2025 ACS 5-year | 2021–2025 | — | **Not released. Date is "TBD"** | 2025 schedule page (updated Oct 29, 2026): 1-year came out Oct 29, 2026; footnote 5 says the remaining 2025 product dates "will be forthcoming". `api.census.gov/data/2025/acs/acs5` returns 404. |

**Vintages used:** 2019–2023 and 2020–2024. These are the two latest releases. Expect
2021–2025 to replace 2019–2023 once it comes out, probably early 2027 since the 1-year
release was late. When it does, re-run and bump the vintages.

Both vintages use 2020 Census tract boundaries. Census's "Geography Boundaries by Year" page
lists Census Tract = "2020 Census" for current ACS products. Checks:

- The tract GEOID sets are identical across the two ACS vintages (1,620 each).
- They match the TIGER 2024 tract list (1,620).
- `cb_2023` and `cb_2024` tract polygons have identical GEOID sets (1,613).

## 2. Access route: the API needs a key now

The brief assumed `api.census.gov` works without a key at low volume. **That is no longer
true.** Every data query, even `get=NAME,B19013_001E&for=state:25`, returned `HTTP 302` to
`https://api.census.gov/data/missing_key.html` with header `x-datawebapi-keyerror: 1`.
Metadata endpoints (`/variables/*.json`, `/acs/acs5.json`) still work without a key.

So the values come from the **ACS table-based Summary File**. It is the same official
estimates and needs no key:

```
https://www2.census.gov/programs-surveys/acs/summary_file/{YEAR}/table-based-SF/data/5YRData/acsdt5y{YEAR}-{table}.dat
```

These are pipe-delimited national files keyed by `GEO_ID`. MA tracts are
`1400000US25…` and MA county subdivisions are `0600000US25…`. The files are stored untouched
in `data/raw/census/acs/`.

Sanity check against published figures: the MA state rows give $101,341 for 2019–2023 and
$103,960 for 2020–2024.

For later refreshes through the API, the owner needs a free key from
https://api.census.gov/data/key_signup.html, kept in the local `.env`. The summary-file
route keeps working without one.

## 3. Variables

| Output column | Source cell | Census variable | Label |
| --- | --- | --- | --- |
| `median_income`, `moe` | `B19013_E001`, `B19013_M001` | B19013_001E / _001M | Median household income in the past 12 months (in {year} inflation-adjusted dollars) |
| `households`, `households_moe` | `B11001_E001`, `B11001_M001` | B11001_001E / _001M | Household Type: Total (= households = occupied housing units, B25003_001E) |
| context: `per_capita_income` | `B19301_E001`, `B19301_M001` | B19301_001E / _001M | Per capita income in the past 12 months |

- Labels were verified from `api.census.gov/data/{2023,2024}/acs/acs5/variables/*.json`,
  saved in `data/raw/census/acs/meta/`.
- MOEs are published at the 90% confidence level.
- **Poverty (B17001) was not collected.** Its summary file is about 118 MB per year, and the
  small API call needs a key. Add it later through the API once a key exists.

## 4. Jam values and suppression

Source: Census "Notes on ACS Estimate and Annotation Values" (saved in
`data/raw/census/docs/`). The summary file carries the numeric jam codes, not the
annotation strings.

| Raw value | Meaning | Our handling |
| --- | --- | --- |
| `-666666666` (est.) | Could not be computed: too few sample observations. For 5-year medians, also used when the MOE was larger than the median. | `median_income` empty; `flag=not_computed` |
| `-999999999` | Not displayed: too few sample cases | empty; `flag=not_displayed` |
| `-888888888` | Not applicable | empty; `flag=not_applicable` |
| `-222222222` (MOE) | MOE could not be computed | `moe` empty; `moe_flag=moe_not_computed` |
| `-333333333` (MOE) | MOE not computed: median in an open-ended interval | `moe` empty; `moe_flag=moe_open_ended` |
| `-555555555` (MOE) | Controlled estimate, so no sampling error | `moe=0`; `moe_flag=moe_controlled` |
| `250001` (est.) | "250,000+": median in the top open-ended interval | value **kept** as 250001 but `flag=topcoded_250000plus`. It is a floor, not a point estimate. |
| `2499` (est.) | "2,500-": bottom-coded | `flag=bottomcoded_2500minus` (none occur in MA) |

- A jam code is **never** turned into 0.
- The raw strings are kept verbatim in `*_raw` columns. The clean numeric columns are empty
  wherever a jam code appears.
- `cv = (moe/1.645)/estimate`.
- `reliability` is `high` (CV ≤ 15%), `medium` (≤ 30%) or `low` (> 30%). These are common
  practitioner thresholds, not a Census rule.

## 5. Boundaries

| Use | File | Notes |
| --- | --- | --- |
| Tract display | `cb_2024_25_tract_500k.zip` (GENZ2024) | 1:500k cartographic boundary. Clipped to the shoreline, so the **7 water-only tracts are absent** (1,613 of 1,620). |
| Tract point-in-polygon (retailer → tract) | `tl_2024_25_tract.zip` (TIGER2024) | Full resolution, all 1,620 tracts. **Use this, not the 500k file, to assign geocoded retailers to tracts.** Generalized edges can put a store on the wrong side of a street-boundary tract. |
| Town display | `cb_2024_25_cousub_500k.zip` | 351 county subdivisions = MA's 351 cities and towns (293 towns, 58 cities by LSAD) |
| Cross-check | `cb_2023_25_{tract,cousub}_500k.zip` | Vintage comparison |

The Census county subdivisions are used for towns because they share GEOIDs with ACS town
income and with the 2020 block assignment file.

MassGIS alternative, not downloaded:
`https://s3.us-east-1.amazonaws.com/download.massgis.digital.mass.gov/shapefiles/state/townssurvey_shp.zip`
(survey-based municipal boundaries, 19.5 MB, Last-Modified 2024-05-20). It uses MassGIS
`TOWN_ID` 1–351, not FIPS, so it would need a name join. It has finer coastline detail.

**Town code change to watch.** Four municipalities dropped "Town" from their legal names
between the 2023 and 2024 vintages, and Census gave them new FIPS codes. The 2019–2023 ACS and
the 2020 block assignment file use the old codes. Each pair was matched by name and county and
checked by polygon overlap (IoU = 1.0). `town_income.csv` has a `geoid_2024` column holding the
mapped code.

| Old (2020–2023) | New (2024) |
| --- | --- |
| 2500901260 Amesbury Town city | 2500901185 Amesbury city |
| 2500940710 Methuen Town city | 2500940675 Methuen city |
| 2501519370 Easthampton Town city | 2501519365 Easthampton city |
| 2501773440 Watertown Town city | 2501773405 Watertown city |

## 6. Tract → town crosswalk

Tracts do not nest in towns. Method:

1. **2020 Block Assignment File**, `BlockAssign_ST25_MA_MCD.txt`: each of the 107,278 blocks
   gets a county subdivision. Blocks nest in tracts.
2. Weight each block by 2020 Census `POP20` and `HOUSING20` from TIGER
   `tl_2020_25_tabblock20`. The total is 7,029,917 people, which matches the 2020 count.
3. Sum blocks to tract × town and compute `pop_share`, `hu_share` and `aland_share`.
4. **Primary town** = the town with the most 2020 population. Ties and empty tracts fall back
   to housing units, then land area, then block count (`primary_basis`).
5. Remap the four renamed town codes. Code `…00000` means "county subdivision not defined"
   (open water) and is flagged `is_water_cousub`.

Results:

- 52 tracts touch more than one subdivision code. 13 of them touch only water slivers.
- 44 tracts span more than one land town. **28 have population in more than one town.**
- 33,575 people (0.48% of the state) live outside their tract's primary town.
- 7 tracts have a primary-town share below 50%: Colrain 36%, Bernardston 48%, Erving 49%,
  Leverett 41%, Chester 42%, Russell 41% and Worthington 39%. All are rural hill-town tracts
  in Franklin, Hampden and Hampshire counties. One tract spans up to 10 land towns.
- Every tract in the GeoJSON gets a `town`.

**Town roll-up guidance:** do not average or re-median tract incomes into towns. Use the ACS
town-level estimate (`town_income.csv`, B19013 at county-subdivision level). For counts such as
claims and retailers, use the claim's own listed town, or the crosswalk shares.

## 7. Outputs

The raw data is in `data/raw/census/` (276 MB). Each file is listed in `SOURCES.txt` with URL,
UTC fetch time, HTTP status, size and sha256. Most of the space is the 107 MB
`tl_2020_25_tabblock20.zip`, used only for the crosswalk weights.

| File (`data/processed/`) | Size | Content |
| --- | --- | --- |
| `tracts_ma.geojson` | **2.03 MB** (1,613 features) | GEOID, NAME, NAMELSAD, COUNTYFP, county, town, town_geoid, town_pop_share, n_towns (land), ALAND, AWATER, centroid_lon/lat, centroid_inside, inner_lon/lat |
| `tract_income.csv` | 297 KB (3,240 rows = 1,620 × 2) | geoid, acs_release, acs_end_year, dollar_year, median_income, moe, households, households_moe, flag, moe_flag, cv, reliability, `*_raw` |
| `towns_ma.geojson` | 594 KB (351) | GEOID, NAME, NAMELSAD, LSAD, county, ALAND, AWATER, centroid, n_tracts_primary |
| `town_income.csv` | 76 KB (714 = 357 × 2) | Same columns as tract income, plus `geoid_2024` and `no_cousub_water` |
| `tract_town_crosswalk.csv` | 176 KB (1,713) | tract_geoid, town_geoid, pop20, hu20, aland20, shares, n_towns*, is_primary, primary_basis |
| `tract_income_context.csv` | 161 KB | Per-capita income ± MOE, both vintages |
| `census_verify_report.json` | — | Machine-readable version of section 8 |

Geometry notes:

- No extra simplification was needed. The 500k file is already generalized. Coordinates are
  rounded to 5 decimals (about 1 m), RFC 7946 / WGS84.
- 0 invalid geometries.
- Centroids are true area centroids computed in EPSG:26986. 21 tracts have their centroid
  outside the polygon (`centroid_inside=false`), for example crescent-shaped coastal tracts and
  tracts with holes. `inner_lon/lat`, a point guaranteed inside, is provided for labels.
- The PRD's "tract in radius if centroid inside" rule still uses the centroid.

The scratch scripts are in `scripts/scratch/census/`: `fetch.py`, `fetch_extra.py` (TIGER
tract) and `process.py`. They were run from a scratch venv (Python 3.14, geopandas 1.2,
shapely 2.2, pyogrio 0.13), not the project.

## 8. Verification

| Check | 2019–2023 | 2020–2024 |
| --- | --- | --- |
| Tracts in ACS | 1,620 | 1,620 |
| Income `ok` | 1,565 | 1,554 |
| `not_computed` (−666666666) | 35 | 35 |
| … of which tracts with households > 0 | 8 | 9 |
| `topcoded_250000plus` | 20 | 31 |
| Other jam codes (−999…, −888…, −555…, bottom-coded) | 0 | 0 |
| Median MOE as % of estimate (`ok` tracts) | **20.2%** | **21.2%** |
| 90th-percentile MOE % | 40.6% | 39.8% |
| Reliability high / medium / low | 1,022 / 475 / 68 | 994 / 484 / 76 |
| Tracts with 0 households | 27 | 26 |
| Income GEOIDs with no polygon | 7 (below) | 7 (same) |
| Polygons with no income row | 0 | 0 |

- **Non-joins.** These 7 tracts are water-only, with ALAND = 0, 0 households and income
  `not_computed`: 25001990000, 25005990000, 25007990000, 25009990100, 25019990000, 25023990003,
  25025990101. They exist in TIGER but not in the shoreline-clipped 500k file. Nothing is lost.
- **Suppressed income in populated tracts.** Each case has 4 to 75 households, except
  25025010103 in 2020–2024 (336 households, Boston). The other cases are mostly college,
  institutional or park tracts (98xxxx, 82xxxx).
- Across vintages, 34 tracts are suppressed in both. One tract moved ok → suppressed and one
  moved suppressed → ok. 11 tracts became top-coded in 2020–2024.
- **Town income.** All 351 towns join to a polygon in both vintages (2019–2023 after the code
  remap). The 6 extra rows per vintage are water-only "county subdivisions not defined", with
  income not computed. Towns: 344 ok, 8 not computed and 5 top-coded (2020–2024).

## 9. Caveats for the UI and the statistics

1. **Tract income is not buyer income.** It describes households living in the tract, not the
   people who bought or claimed a ticket there. Ticket buyers commute, travel and shop across
   tracts, and claim locations may not even be the place of sale (an open PRD question).
   Any income–claims association is ecological. Show the PRD's ecological-inference note.
2. **The two vintages overlap.** 2019–2023 and 2020–2024 share four of five survey years (2020
   to 2023). The difference between them is not a year-over-year change, and most tract
   differences are inside the MOE. Show them as two vintages side by side.
3. **They are in different dollars** (2023 vs 2024 CPI-U-RS adjusted). Do not subtract them
   without inflation adjustment, and even then caveat 2 still applies.
4. **MOEs are large.** The median tract MOE is about 20% of its estimate, and 68 to 76 tracts
   have CV above 30%. Always show ± MOE, and use the MOE for the PRD's "income redraw"
   robustness check. Top-coded tracts have no MOE and only a floor.
5. **5-year estimates are period averages, not a 2024 snapshot.** The 2020–2024 window
   includes pandemic-era survey disruption, especially the 2020 collection.
6. **A tract is not a town.** 28 populated tracts straddle towns. Use town-level ACS for town
   views, not tract aggregation.
7. **Use the full-resolution tract file for point-in-polygon.** The 500k display file can
   misassign stores near tract edges.
8. Per-capita income (context) has the same caveats. Poverty is not collected yet.

## 10. Could not confirm or left open

- **API keyless access** is gone, verified 2026-11-10 UTC. A key is needed for future API use
  (owner action: sign up, store in `.env`).
- **The 2021–2025 5-year release date** is not published ("TBD").
- **The reason 2020–2024 moved to Jan 29, 2026** was not researched.
- **Poverty** (B17001 / S1701) was not collected.
- **MassGIS municipal boundaries** were referenced but not downloaded or compared.
