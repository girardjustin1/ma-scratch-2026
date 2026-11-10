# Research: Mass Lottery scratch game catalog and licensed retailers

Date: 2026-11-09 (US Eastern), fetched 2026-11-10 01:13–01:20 UTC.
Scope: sources only. No application code. Raw responses are under `data/raw/lottery_games/`
and `data/raw/lottery_retailers/` (gitignored). Normalized samples are in `data/samples/`.

## TL;DR

- **Game catalog and prizes remaining.** The masslottery.com front end calls JSON endpoints with
  no login: `/api/v1/games` (catalog), `/api/v1/instant-game-prizes/special` (TOP and SECONDARY
  tiers for every scratch game in one call) and `/api/v1/instant-game-prizes?gameID=N` (the full
  tier table for one game, plus overall odds and the printed-ticket count).
- **Scratch games now: 134 listed. 103 are on sale and 31 are claims-only** ("no longer for sale",
  each with a last day to redeem). So "top 100 open games" is 100 of 103.
- **Tickets printed is published,** as text: "Prize structure is based on the sale of approximately
  16,128,000 tickets." It is only in the per-game response, so a full snapshot takes 134 calls.
- **Launch top prize:** usually you can still identify it after it is claimed. The tier stays
  with `prizesRemaining: 0`. But the `type: "TOP"` label and `prizeAmount` field are not reliable
  (see Risks). Take the largest amount parsed from `prizeDescription` across the full table.
- **History:** the Lottery publishes no history. The Wayback Machine holds about 14 monthly captures
  of `/special` (Nov 2022, then Jan 2025–Oct 2026) and 64 sparse per-game captures. Treat these as
  a fallback only. Real history has to be built going forward, one dated snapshot per refresh.
- **Retailers.** The only official source found is `/api/v2/retailers/nearby?latitude&longitude`.
  It returns the **100 nearest** retailers with id, name, address, town, ZIP, lat/lon and product
  flags. There is no bulk list. No state open-data dataset was found. A statewide list needs a
  tiled sweep, a supplied file or a public-records request.
- **Total retailer count: not confirmed.** Secondary figures: "approximately 7,500 retailers"
  (MA Treasury, FY2018) and "9,732 lottery sales agents who were active during the audit period"
  (State Auditor, audit period from 2019).
- **Join to winners.** The winners list carries the game `identifier` slug, which joins exactly to
  the catalog. It carries retailer **name + town strings, not ids**. Matching to retailers is by
  normalized name + town. In the week 2026-11-01..07, 3,680 of 6,599 rows (56%) are
  `retailer_location: "Online"`. 2,907 rows have a `retailer` name, and 12 non-Online rows lack one.

## Terms of use and robots.txt

| Check | Finding | Evidence |
| --- | --- | --- |
| robots.txt | **There is none.** `https://www.masslottery.com/robots.txt` returns HTTP 200 with the SPA's HTML shell, not a robots file. So there are no crawl directives. | `data/raw/lottery_games/20261110T011306Z_robots_txt_returns_spa_html.html` |
| Terms ("Legal Notice", `/about/legal-notice`, served via `/api/v1/cms/page?path=/about/legal-notice`) | Quote: "You may not modify, copy, reproduce, republish, upload, post, transmit or distribute in any way any material from this site including code and software. You may download material from this site for your personal, non-commercial use only, provided you keep intact all copyright and other proprietary notices." The terms do not mention robots, scraping or automated access. | `20261110T011443Z_cms_page_legal-notice.json` |
| Accuracy disclaimer | "The Lottery does not warrant or make any representations regarding the use or the results of the use of the materials in this site … in terms of their correctness, accuracy, timeliness, reliability or otherwise." The prize table UI says: "Every effort is made to update this information hourly." | legal notice JSON; JS bundle |

**Conclusion:** automated fetching is not forbidden, and personal non-commercial download is
explicitly allowed. That fits a local, personal dashboard. **Republishing or distributing the data
is not allowed.** Keep `data/` out of the public repo (already gitignored). Do not host derived
tables publicly. Exports should stay personal and carry a "Source: Massachusetts State Lottery"
notice.

Fetching etiquette used here: User-Agent
`ma-scratch-2026-research/0.1 (personal non-commercial research; contact …)`, 1.5 s or more between
calls. Total requests: masslottery.com 16, site JS on the Fastly CDN 1, web.archive.org CDX 2.

## Sources

| # | Dataset | URL | Auth | Grain | Sample file |
| --- | --- | --- | --- | --- | --- |
| A1 | Game catalog (all game types) | `GET https://www.masslottery.com/api/v1/games` | none | game | `20261110T011454Z_games.json` (174 games) |
| A2 | Prizes remaining, all scratch games, TOP + SECONDARY tiers only | `GET https://www.masslottery.com/api/v1/instant-game-prizes/special` | none | game × tier | `20261110T011456Z_instant-game-prizes_special.json` (134 games, 179 tiers) |
| A3 | Full prize table for one game | `GET https://www.masslottery.com/api/v1/instant-game-prizes?gameID={massGameID}` | none | game × tier | `…_gameID-340/354/571/512.json` |
| A4 | Game rules text (game #, est. payout %, start date, play style) | `GET https://www.masslottery.com/api/v1/games/rules/{identifier}` (a numeric id returns HTTP 500) | none | game | `…_games_rules_4M-mayhem-2022.json` |
| A5 | Active price points | `GET https://www.masslottery.com/api/v1/games/active-prices` | none | — | `…_games_active-prices.json` |
| A6 | Human pages | `https://www.masslottery.com/tools/prizes-remaining`, `/games/draw-and-instants/{identifier}` | none | — | SPA (renders A1–A3) |
| A7 | History fallback | Wayback CDX: `https://web.archive.org/cdx/search/cdx?url=masslottery.com/api/v1/instant-game-prizes*` | none | capture | `…_wayback_cdx_*.json` |
| B1 | Retailer locator | `GET https://www.masslottery.com/api/v2/retailers/nearby?latitude={lat}&longitude={lon}&userLatitude={lat}&userLongitude={lon}` (optional filters from the bundle: `aonMonitor`, `kenoMonitor`, `wolMonitor`, `functionallyAccessible`, `nearlyFunctionallyAccessible`) | none | retailer | `data/raw/lottery_retailers/…_nearby_boston.json`, `…_worcester_limit-param.json`, `…_petersham.json` |
| B2 | Winners list (owned by the winners research; used here only for the join test) | `GET https://www.masslottery.com/api/v1/winners/query?start_index&count&date_from&date_to&games&prize_amounts&cities&sort` | none | listed prize | `data/raw/lottery_winners/` |

How these were found: the site is a React SPA. Its bundle
(`https://mslc-prod-herokuapp-com.global.ssl.fastly.net/main.2646555282515695.js`, saved as
`20261110T011318Z_main_bundle.js`) defines `apiRoots.v1 = "/api/v1"` and the calls
`GamesApi.fetchAllGameInformation → /games`, `InstantPrizesAPI.fetchSpecialPrizes →
/instant-game-prizes/special`, `InstantPrizesAPI.fetchGamePrizes(gameID) → /instant-game-prizes
?gameID=`, and `RetailersApi.getNearbyRetailers → /api/v2/retailers/nearby`. The bundle filename
changes with each deploy, so do not hard-code it.

## A. Game catalog: field dictionary

### A1 `/api/v1/games` (one row per game, all products)

Counts on 2026-11-10: 174 games. By type: Scratch 134, e-Instant 27 (iLottery), Draw 10, Rapid 2,
V-Sports 1. **Filter `gameType == "Scratch"`.** e-Instant games are online-only and have no
prize table in A2.

| Field | Example | Notes |
| --- | --- | --- |
| `id` | 354 | Equals `massGameID` in A2/A3 for scratch games, and equals the printed "Game #" (A4 says "Game #354"). **Use as `game_id`.** |
| `identifier` | `4M-mayhem-2022` | URL slug. **The same slug appears in the winners list.** Not always a slug: game 433's identifier is `"433"`. |
| `name` | `$4,000,000 Mayhem` | May have trailing spaces. |
| `gameType` | `Scratch` | |
| `price` | 10 | Dollars. |
| `startDate` | `2022-04-19` | Launch date. |
| `odds` | `1 in 3.47` | Overall odds, a string. |
| `topPrize` / `topPrizeDescription` | 1000000 / `A Year For Life /Min 20 Yrs` | Marketing headline. **Does not always match the prize table** (see Risks). |
| `tags` | `["Expiring Game"]` | `Expiring Game` means no longer on sale. Other tags: `Second Chance`, `Scan to Enter`, `New Game`. |
| `expirationDate` | `2026-12-18` | Present only on Expiring games. The UI renders: "This game is no longer for sale. The last day to redeem a prize is {expirationDate}." |
| `tileFlag` | `Ending Soon` | UI badge. |
| `icon`, `gameCollectionIcon` | Contentful image URLs | Not needed. |

**Status derivation:**
`open_on_sale` = Scratch and no `Expiring Game` tag (**103**).
`closing_claims_only` = tag `Expiring Game`, with `expirationDate` as the claim deadline (**31**).
`closed` = gone from A1/A2. A game that disappears between snapshots should be marked closed on
that date. **The API has no explicit "closed" status and no closed-game history.**

Open games by price: $1: 10, $2: 21, $5: 28, $10: 26, $20: 9, $30: 5, $50: 4.
Of the 103 open games, 97 still have at least one `type: TOP` prize unclaimed. Of the 31 closing
games, 15 do.

### A2/A3 `/api/v1/instant-game-prizes` (game header + `prizeTiers[]`)

Game header fields: `massGameID`, `gameName`, `gameIdentifier`, `startDate`, `ticketCost`.
A3 also has `odds` (overall) and `prizeTierInfo`, a Contentful rich-text document.

| Tier field | Example | Notes |
| --- | --- | --- |
| `tierNumber` | 12 | Numbering can have gaps (354 has no tier 7; 571 has no tier 5). Not ordered in the array. |
| `prizeAmount` | 4000000 | Number. For annuity or for-life prizes it is a valuation, not the headline (452: 6,500,000 for "$10,000,000 ($500K/YR/20YRS)"; 484: 2,000,000 for "$2,500/WK/LF"). **Can be 0** (512's $200,000 tier). |
| `prizeDescription` | `$4,000,000 ($200K/YR/20YRS)` | Display text, and the reliable headline value. |
| `totalPrizes` | 3 | Total at launch. |
| `paidPrizes` | 3 | Claimed. |
| `prizesRemaining` | 0 | Equals total − paid in every sample row. |
| `odds` (A3 only) | `1 in 5,376,000` | Per-tier odds. |
| `type` | `TOP` / `SECONDARY` / `REGULAR` | Editorial label. **Not reliable for "launch top prize"** (see Risks). |

**Tickets printed:** published. A3's `prizeTierInfo` text says "Prize structure is based on the
sale of approximately **16,128,000** tickets" (354). Cross-check: for every tier, `totalPrizes` ×
the tier's odds denominator gives about the same number (354: 16,128,000 on most tiers; 571:
8,064,000; 340: 15,120,000; 512: 4,032,000). Parse the text, then validate it against the tier
odds. The figure is **not in A1 or A2**, so it needs one A3 call per game.

**Launch top prize after it is claimed:** yes, in the samples. 354 keeps
`{"type":"TOP","prizeAmount":4000000,"totalPrizes":3,"paidPrizes":3,"prizesRemaining":0}`, so
claimed tiers are not dropped. But in 512 ("$200,000 HALLOWEEN"), the $200,000 tier is
`type: REGULAR, prizeAmount: 0`, and `TOP` is the $10,000 tier. **Rule:** original top prize =
the largest dollar amount parsed from `prizeDescription` across the **full A3 table**. Keep
`prizeDescription` verbatim, and flag any game where that disagrees with the `type: TOP` tier or
with A1 `topPrize`. A2 alone would miss 512's $200k tier entirely.

**Freshness:** the UI says the table is updated "hourly" on a best-effort basis. The responses
carry no as-of timestamp, so record `fetched_at` yourself.

### A4 rules

`{"identifier": …, "rules": <rich text>}` with "Game #354", "80.20% Est. Payout",
"Start Date: 4/19/2022" and the play instructions. This is optional. It is the only place the
**estimated payout %** appears, which is a useful check for the EV panel.

### Sample CSVs

- `data/samples/games_sample.csv`: all 134 scratch games from A1 + A2 (snapshot `20261110T011456Z`).
  Columns: `game_id, game_identifier, name, game_type, price, launch_date, status, claim_deadline,
  overall_odds, tickets_printed_approx` (only for the 4 games with A3), `catalog_top_prize,
  top_tier_prize, top_tier_total, top_tier_remaining, largest_unclaimed_prize` (by `prizeAmount`,
  from TOP/SECONDARY only), `original_top_prize_from_full_table` (A3 games only), `snapshot_utc`.
- `data/samples/prize_tiers_sample.csv`: 217 rows. Full tables for 340, 354, 512 and 571 (A3),
  plus TOP/SECONDARY tiers for the other 130 games (A2). The `source` column says which.

## B. Retailers: field dictionary

### B1 `/api/v2/retailers/nearby`

Each call returns a JSON array of exactly the **100 nearest** retailers to the point, sorted by
`distance` in miles. A `limit=1000` parameter was ignored (still 100). `/api/v2/retailers/`
without `nearby` returns the SPA HTML, so there is no list endpoint. The 100-retailer radius is
about 1.3 mi in downtown Boston and Worcester, and about 14.5 mi around Petersham.

| Field | Example | Notes |
| --- | --- | --- |
| `id` | 9650 | Internal locator id. |
| `retailerId` | 432707 | Lottery agent/retailer number. **Use as `retailer_id`.** Both ids were unique in samples. |
| `name` | `7-ELEVEN 35659-A` | Upper case. Often includes a store number. |
| `address`, `address2` | `3 CENTER PLAZA`, `# 101 A` | `address2` is usually empty. |
| `city` | `BOSTON`, `E BOSTON`, `CHARLESTOWN` | Postal place name, not municipality (E BOSTON/CHARLESTOWN are in Boston). |
| `state`, `zipCode` | `MA`, `02108` | |
| `phone` | `(617) 263-6878` | Not needed. Do not store. |
| `latitude`, `longitude` | 42.359085, -71.060120 | **Some are wrong** (see Risks). |
| `distance` | 0.094 | Miles from the query point. Drop it. |
| `games` | `["Keno","Wheel of Luck"]` | Only Keno / Wheel of Luck appear. **Instant tickets are not flagged.** It is implied that all agents sell scratch, but this is unconfirmed. |
| `sellsDrawGame` | true | True in all 300 sampled. |
| `selfService` | true/false | Has a self-service vending machine. |
| `kenoType` / `kenoSoldAtLocation` / `kenoMonitor` | `MONITOR` / true / true | `NONE`, `TO_GO` or `MONITOR`. |
| `wolType` / `wolSoldAtLocation` / `wolMonitor` | `TO_GO` / true / false | |
| `adaCompliant` | `Fully Compliant` / `Partially Compliant` / `Non-Compliant` | |

There is no first-licensed date, no status (active/inactive) and no sales volume.

`data/samples/retailers_sample.csv` has 300 unique retailers from Boston, Worcester and
Petersham/North Quabbin.

### Statewide list and count

- **No bulk download, no open-data dataset found** (searched mass.gov and data.gov; data.gov has
  NY and Iowa lottery retailer sets, not MA). A 2014 MuckRock public-records request got the Lottery
  to supply a licensed Keno agent list with licensure dates:
  https://www.muckrock.com/foi/massachusetts-1/licensed-massachusetts-keno-locations-2014-14204/
  So a **public-records request (M.G.L. c. 66)** for the current list of licensed sales agents
  (name, agent number, address, license dates) is a realistic route. It is also the only route to
  **historical retailer lists**.
- **Count: not confirmed.** Secondary sources: about 7,500 retailers (MA Treasury, 2018,
  https://www.masstreasury.org/single-post/2018/07/24/lottery-produces-estimated-936-million-plus-in-net-profit-for-the-commonwealth);
  9,732 sales agents active during an audit period starting 2019 (State Auditor,
  https://www.mass.gov/info-details/audit-of-the-massachusetts-state-lottery-commission-objectives-scope-and-methodology).
- **Tiled sweep with B1:** possible within the terms (personal download). It has to be adaptive,
  because density ranges from about 1 mi to about 15 mi per 100 retailers. Rough estimate: 300–800
  calls at 1 call per 2 s, about 10–30 minutes. Stop subdividing a cell once its 100th-nearest
  distance exceeds the cell's half-diagonal. Dedupe on `retailerId`. The owner should approve
  this before it runs. A 10 mi area around the owner's pin took only 42 calls (see Pin-area sweep),
  so a statewide sweep may need fewer calls than estimated here.
- **No history:** the locator shows current agents only. Maintain `first_seen` / `last_seen` from
  repeated sweeps (the PRD's `retailers` table already has them).

## Pin-area sweep (2026-11-10 UTC)

Scope: licensed retailers around the owner's pin, not statewide. The pin is stored only in
`data/private/pin.json` (gitignored). This doc and the code never contain it.

**Method.**
1. Adaptive nearest-100 sweep with B1. A call's 100th-nearest `distance` is its covered radius `r`.
   The API's `distance` is the haversine distance on a 3,959 mi Earth radius from the query point
   to the Lottery's own coordinates (checked to within 1e-8 mi). Results are sorted, and every call
   returned exactly 100.
2. Coverage proof: check points on a 0.1 mi grid over the target disk. A point counts as covered
   when it lies within `r − 0.081 mi` of some query, where 0.081 mi = half the cell diagonal plus a
   0.01 mi tolerance. That means every location inside the disk is within `r` of a query.
3. Next query point: take the uncovered check point nearest the pin. Among candidates up to 0.6 ×
   the local radius away, pick the one that covers the most uncovered points.
4. Checked independently with 400,000 random points: none uncovered at 5 mi or 10 mi (minimum
   margin 0.095 mi at 10 mi). At 10.5 mi, 167 were uncovered, so **10 mi is the proven-complete
   radius**.
5. Every request used ≥1.3 s spacing and the project User-Agent, with a hard cap of 250 calls.

**Calls:** 18 to cover 5 mi. That was under 80, so the sweep extended to 10 mi, for **42 calls
total**, all HTTP 200. Covered radius per call ranged from 1.08 to 6.55 mi (median 2.18).
Raw responses and `manifest.csv` (query point, fetched_at, status, n, max distance, sha256) are in
`data/raw/lottery_retailers/sweep/`. The summary is in `sweep_result.json`.

**Retailers:** 1,806 unique `retailerId`s seen. **1,483 lie within 10 mi** of the pin, 626 within
5 mi. Output: `data/processed/retailers_pin_area.csv`, one row per retailer. Columns: `retailer_id`,
`locator_id`, name, address, town, zip, Lottery lat/lon, `distance_mi`, `within_complete_radius`,
Keno/Wheel of Luck flags, `first_seen`, `tract_geoid`, `census_lat`, `census_lon`,
`geocode_quality`, `coord_disagreement_mi`, `coord_flag`. Run metadata is in
`retailers_pin_area_meta.json`.

**Census re-geocode:** one batch to `geocoding.geo.census.gov/geocoder/geographies/addressbatch`
(benchmark `Public_AR_Current`, vintage `Current_Current`) with all 1,806 street addresses. It
returned HTTP 200 in 24 s. The raw request and response are in `data/raw/census_geocoder/`.
For the 1,483 retailers inside 10 mi:

| | Count |
| --- | --- |
| Exact match | 1,278 |
| Non-exact match | 140 |
| Tie (no point) | 4 |
| No match | 61 |
| Lottery vs Census point > 0.25 mi | 63 (42 of them > 1 mi) |
| **Flagged** (> 0.25 mi, tie or no match) | **128 (8.6%)** |
| Median / 90th-percentile disagreement | 0.015 mi / 0.084 mi |
| Distinct tracts (Census point) | 412 |

Most points agree closely. The large disagreements are the bad Lottery points described in Risks,
e.g. stores in Chicopee, New Bedford and Framingham whose Lottery point sits near Boston. Use the
Census point and tract when matched. For flagged rows, keep both coordinate sets and show the store
as low-confidence location.

**Completeness caveat:** the sweep is complete with respect to the *Lottery's* coordinates. A
retailer that really sits inside 10 mi but carries a bad Lottery point far away would be missed. A
retailer that sits far away but has a bad point inside would be included. That second kind is why
the town scope below uses Census-verified points.

**Winners matching: full backfill** (rerun 2026-11-10 on `data/processed/claims_scratch.parquet`:
371,879 listed scratch claims, listed dates 2023-11-09..2026-11-08). The same rules apply, and
ambiguous matches are never merged.
- **Normalization:** upper-case; `&`→AND; apostrophes dropped; punctuation folded to spaces;
  INC/LLC/CORP/CO/LTD/THE and `#123` removed.
- **Tiers, in order** (with `match_confidence`):
  1. Exact normalized name + postal town, unique (high).
  2. Same brand + store number (`#446`, `32441-A`) + town, unique (medium).
  3. Name with store numbers removed + town, unique (medium).
  4. Name + municipality, unique (low). Only used when the retailer's own postal town does not roll up cleanly (e.g. Chestnut Hill). It fired for 79 claims (Putterham Market, Brookline). A generic-name hit across Boston neighbourhoods ("Mobil", Roxbury vs. E Boston) is rejected as `no_match_other_neighbourhood`.
  5. Anything else goes to `unresolved_retailer_matches.csv` with its candidates. Categories:
     `ambiguous` (all tied candidates listed), `no_match_store_number_differs`,
     `no_match_fuzzy_candidates` (up to 3 look-alikes), `no_match_other_neighbourhood` and `no_candidate`.
- **Candidates:** all 1,806 swept retailers. Only matches to a retailer within 10 mi of the pin are
  kept in the outputs. Distance uses the Census point when the Census matched the address,
  otherwise the Lottery point.

**Municipality roll-up.** Postal and neighbourhood location strings are rolled up to their
municipality before the area is decided. The map for every location value in the claims and the
locator (with method and claim count) is `data/processed/location_municipality_map.csv`.
`retailers_pin_area.csv` gains `municipality` (Census point in the municipal polygon of
`towns_ma.geojson`; the Lottery point if there was no Census match), `municipality_source` and
`best_dist`. The rule-based map and the polygon test agree for 1,642 of 1,645 verified retailers.
Non-identity mappings used inside the area:

| Location value (claims) | Municipality | Method |
| --- | --- | --- |
| Allston, Brighton, Charlestown, Dorchester, E Boston, Hyde Park, Jamaica Plain, Mattapan, Roslindale, Roxbury, S Boston, W Roxbury (also their upper-case locator forms; Dorchester Center, East/South Boston, West Roxbury, Readville, Roxbury Crossing, Mission Hill, Back Bay and N Dorchester are on the list too) | Boston | Boston neighbourhood list |
| N Quincy | Quincy | retailer evidence 9/9 |
| W Newton | Newton | retailer evidence 4/4 |
| Auburndale | Newton | retailer evidence 3/3 |
| N Reading | North Reading | direction expanded (outside the area) |
| Chestnut Hill | **AMBIGUOUS** (Newton 2, Brookline 1) | not rolled up, excluded |

Elsewhere in the state, 51 location values (11,744 claims, e.g. Hyannis, Buzzards Bay, Whitinsville)
stay unmapped. They are all outside the area and are listed in the CSV.

**Area by radius.** A municipality is *core* when its whole polygon lies within the radius. It is
*partial* when only part does; some of its stores were never swept, so it is excluded from rates.
- 5 mi core: Chelsea, Everett, Malden, Melrose, Revere, Somerville.
  Partial: Arlington, Boston, Cambridge, Lynn, Medford, Saugus, Stoneham, Wakefield, Winchester,
  Winthrop.
- 10 mi core (20): Arlington, Belmont, Cambridge, Chelsea, Everett, Lynn, Malden, Medford, Melrose,
  Nahant, Revere, Saugus, Somerville, Stoneham, Swampscott, Wakefield, Watertown, Winchester,
  Winthrop, Woburn.
  Partial (13): **Boston**, Brookline, Burlington, Lexington, Lynnfield, Marblehead, Newton, Peabody,
  Quincy, Reading, Salem, Waltham, Wilmington.
- Boston reaches beyond 10 mi (Hyde Park, West Roxbury), so after roll-up it is partial at both
  radii. Its claims still match and appear in the parquet, but they are not in the rate
  denominators.

**Match rate for claims whose municipality is core** (claims with a retailer name):

| Year | 5 mi | 10 mi |
| --- | --- | --- |
| 2023 (Nov 9–Dec 31) | 749 / 848 (88.3%) | 1,718 / 1,959 (87.7%) |
| 2024 | 5,697 / 6,254 (91.1%) | 13,402 / 15,097 (88.8%) |
| 2025 | 5,379 / 5,651 (95.2%) | 12,653 / 13,718 (92.2%) |
| 2026 (to Nov 8) | 4,267 / 4,368 (97.7%) | 10,016 / 10,632 (94.2%) |
| **All** | **16,092 / 17,121 (94.0%)** | **37,789 / 41,406 (91.3%)** |

| Other figures | 5 mi | 10 mi |
| --- | --- | --- |
| Unresolved (pairs / claims) | 48 / 1,029 | 104 / 3,617 |
| …of which ambiguous (claims) | 168 | 1,681 |
| Matched claims whose retailer geocode is flagged (tract withheld, dropped from tract analysis) | 1,393 (8.7% of matched) | 3,582 (9.5% of matched) |
| Core-municipality claims with no retailer name | 78 | 79 |

The match rate falls with age because the locator lists only agents active today, so stores that
closed or were renamed since 2023 can't match. The largest unresolved items are genuinely
ambiguous: several same-name stores in one town, such as "Richdale" (3 in Lynn), "One Stop Mart"
(Lynn), "Stop N Save" (Stoneham), "The Corner Store" (Everett) and "A L Prime Energy" (Lynn,
Woburn). A few current stores never match because the winners list uses a name the locator does
not ("A To Z Convenience", Lynn). Resolving either case needs an address, which the winners list
lacks. One judgment call to review: 7-Eleven franchise letters differ in some store-number matches
(`32466-B` vs `32466C`). They are matched on the shared store number.

**Outputs** (all in `data/processed/`):
- `claims_pin_area.parquet`: one row per scratch claim matched to a retailer within 10 mi.
  70,638 rows; 1,273 retailers; 32,303 rows within 5 mi. Columns: `listed_date, game_identifier,
  game_name, prize_amount_usd, retailer_id, match_method, match_confidence, tract_geoid,
  distance_mi`. `tract_geoid` is the Census-verified tract, null when the retailer's geocode is
  flagged (64,782 rows have a tract). It includes matches in partial municipalities such as Boston.
- `retailer_matches_pin_area.csv`: 1,473 matched (retailer, location) pairs.
- `unresolved_retailer_matches.csv`: 378 pairs with candidates.
- `location_municipality_map.csv`
- `claims_pin_area_meta.json`: all the figures above.

## Join strategy to the winners list

Tested against the winners samples for 2026-11-01..07 (6,599 rows, in `data/raw/lottery_winners/`).
Winner row fields: `date_of_win, prize_amount_display, prize_amount_usd, identifier, name,
retailer_location`, and sometimes `retailer`.

1. **Game join: winners `identifier` → A1 `identifier` → `id`.** 110 of 111 distinct identifiers
   matched the current catalog (76 are Scratch). The one miss, `timberwolf`, is presumably a game
   that has already left the catalog. Keep a `games_seen` table so closed games still resolve. Do
   not join on `name` (trailing spaces, case).
2. **Retailer join: there is no id in the winners list.** Use `retailer` (title case, e.g.
   `7-Eleven 33058-C`) + `retailer_location` (town, e.g. `E Boston`) against B1
   `upper(name)` + `upper(city)`. Exact case-insensitive name+town matched 38 winners rows against
   the 100-retailer Boston sample alone. Normalize as follows: upper-case; collapse whitespace and
   punctuation; `&`→`AND`; strip `#`. When the name is unique within the town, a store-number
   suffix match also works. Log any non-unique or fuzzy matches to an `unresolved_retailers` table,
   never auto-merge. Town strings are postal names (`E Boston`, `S Boston`, `Dorchester`). Map them
   to municipalities with a ZIP/place crosswalk before any tract or town roll-up.
3. **Unmatchable rows:** in that week 2,907 of 6,599 rows had a `retailer` field.
   `retailer_location = "Online"` covered 3,680 rows (iLottery/e-Instant), and 12 store rows had no
   retailer name. Exclude Online from all map metrics. Keep rows without a retailer at town level
   only, with a coverage flag.

## Historical prizes-remaining snapshots

- **Official:** none. Responses have no as-of field and no history endpoint.
- **Wayback Machine (fallback, note it in coverage):**
  - `/api/v1/instant-game-prizes/special`: monthly-collapsed captures on 2022-11-09, 2025-01-06,
    2025-08-02, 2025-09-03, 2025-10-24, 2025-11-08, 2025-12-05, 2026-01-03, 2026-02-05, 2026-03-01,
    2026-05-02, 2026-06-11, 2026-08-02 and 2026-10-02. These are TOP/SECONDARY tiers only, so they
    are not usable for the low-tier "tickets remaining" estimate.
  - `?gameID=` full tables: 64 captures for 45 games (2022: 4, 2025: 18, 2026: 42). Too sparse for
    series, but useful for spot checks.
  - The `/tools/prizes-remaining` HTML has 40 captures since 2021, but the page is client-rendered,
    so archived HTML probably has no numbers.
- **Plan:** accumulate going forward. One dated snapshot per user-triggered refresh, stored as the
  `prize_tiers` grain (game × tier × snapshot). Wayback imports must be tagged `source=wayback` with
  the capture timestamp.
- The counts above came from an unfiltered first look. The **Wayback history** section below
  has the full pull, limited to captures since 2023-11.

## Wayback history

Built 2026-11-10 UTC (2026-11-09 US Eastern) as the "earlier estimates" history for the EV
panel. The owner chose this over a legacy EV file. All content is official Lottery responses as
archived by the Internet Archive. Nothing came from masslottery.com directly, and no login was
used. Raw bytes, outputs and the manifest are local and gitignored. **No Lottery rows are
reproduced here.**

### TL;DR

- **89 game × date EV points** for **57 games** on **24 capture dates**, from **2025-01-06 to
  2026-09-24**. Of the 57 games, 38 have 1 point, 10 have 2, 7 have 3, one has 4 and one has 6.
  This gives spot estimates, not a series.
- Every point comes from a full per-game table (`?gameID=N`) whose own capture states the
  tickets printed. **No fallback was needed:** 0 points borrowed tickets printed from another
  capture or from the live API.
- **There are no full tables between 2023-11 and 2024-12.** The first is dated 2025-01-06.
  `/special` (TOP/SECONDARY only) and the catalog cannot produce EV. The per-game HTML pages are
  SPA shells with no numbers.
- The hand-check on 2 games matched the pipeline to the cent. **8 points have a positive EV**
  and are flagged `check_inputs`. They have known causes (below). Two more points rest on a
  bad capture-day `prizeAmount` and are flagged.

### Coverage by URL pattern (CDX, `from=20231101`, queried 2026-11-10)

| Pattern | CDX rows | Distinct capture dates | Games | Content | Usable for EV |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/instant-game-prizes?gameID=N` (A3) | 89, all HTTP 200, 89 distinct digests | 24 (2025-01-06 .. 2026-09-24) | 57 | **Full table**, tickets-printed text, tier odds | **Yes** (all 89) |
| `/api/v1/instant-game-prizes/special` (A2) | 31 (30 × 200, 1 × 302) | 30 (2025-01-06 .. 2026-10-02) | 213 across all captures | TOP + SECONDARY tiers only | No: no lowest tier, no tickets printed |
| `/api/v1/games` (A1 catalog) | 60 (54 × 200, 6 `warc/revisit`), 45 distinct digests | 60 (2023-11-01 .. 2026-10-02) | 238 scratch games across all captures | Name, price, odds, tags, `expirationDate` | No: used for names, prices and claims-only status only |
| `/games/draw-and-instants/{identifier}` (HTML) | 2,004 per-game captures (2,061 with listing variants) | 512 (2023-11-01 .. 2026-09-12) | 212 slugs | **SPA shell.** One capture fetched (7.4 KB): only the JS bundle tag, no prize data | No |
| `/tools/prizes-remaining` (HTML) | 70 | 53 | — | **SPA shell.** One capture fetched (3.1 KB): no numbers | No |

Full-table captures by month: 2025-01: 5, 2025-09: 2, 2025-10: 3, 2025-11: 7, 2025-12: 2,
2026-01: 8, 2026-02: 8, 2026-03: 1, 2026-05: 5, **2026-06: 41** (88 distinct timestamps; two games share one), 2026-08: 2, 2026-09: 4. They
cluster where someone browsed game pages while the archive's crawler was recording XHRs. EV
points by ticket price: $2: 3, $5: 28, $10: 37, $20: 11, $30: 4, $50: 6.

`/special` capture dates: 2025-01-06, 08-02, 08-11, 09-03, 10-24, 11-08, 11-10, 11-11, 11-12,
11-25, 12-05, 12-10, 12-15, 12-21, 12-23, 12-24, 12-28; 2026-01-03, 01-21, 02-05, 02-27, 03-01,
03-21, 03-25, 05-02, 06-11, 06-16, 06-28, 08-02, 10-02. The first look's 2022-11-09 capture is
before the 2023-11 window.

### Method

1. **CDX:** 6 queries (one first attempt returned HTTP 504 and was retried with a narrower
   query). The `www.` and bare-host URLs are merged by the archive's URL canonicalization.
2. **Fetch:** every distinct-digest JSON capture via the raw form
   `web.archive.org/web/<ts>id_/<url>` (89 + 30 + 45 = 164), plus 2 HTML probes. **Total
   archive.org requests: 172** (under the 400 cap), with at least 1.6 s between requests. Every
   request returned HTTP 200 except the one 504. The 6 catalog `warc/revisit` rows reuse their
   base capture's bytes and keep their own dates.
3. **Parse** into `data/processed/`:
   - `prize_tiers_history.parquet` (6,349 rows: 1,036 `wayback_full`, 5,313 `wayback_summary`).
     Columns: `game_id, snapshot_date` (UTC capture date), `capture_timestamp, tier_number,
     prize_description, tier_value, tier_value_basis, value_advertised` (first $ amount in the
     description), `value_valuation` (`prizeAmount`), `is_annuity, annuity_values_differ, total,
     paid, remaining, tier_odds, tier_type, is_launch_top_prize, source, capture_url`.
   - `is_launch_top_prize` (full tables only; null for summary rows) is the tier with the largest
     of (advertised, valuation) across the full table. This catches tiers labelled `REGULAR`,
     and "/WK/LF" prizes whose first $ amount is a weekly figure. Each of the 89 captures has
     exactly one such tier. In 2 captures it is not the tier labelled `TOP`.
   - `tier_value` = `prizeAmount` (all 1,036 full-table tiers had `prizeAmount` > 0, so none
     needed the description). **Annuity tiers:** both amounts are kept and
     `annuity_values_differ` is set where they disagree (e.g. a $10M headline valued at
     6,500,000; a "$2,500/WK/LF" tier valued at 2,000,000; "A Year For Life" valued above its
     headline). EV uses the valuation. This is an assumption, and `method_note` says so.
   - `games_history.parquet` (12,059 rows): `game_id, name, identifier, price, start_date,
     tickets_printed` (only from full-table captures, parsed from "based on the sale of
     [approximately] N tickets"; the word "approximately" is missing in some captures),
     `overall_odds, snapshot_date, capture_timestamp, source` (`wayback_full`,
     `wayback_summary`, `wayback_catalog`, `wayback_catalog_revisit`), `capture_url,
     catalog_tags, catalog_expiration_date`.
4. **EV** (`ev_history.parquet`, 89 rows), per PRD feature 4. Lowest tier = the tier(s) with the
   smallest `tier_value`. tickets_remaining_est = printed × low_rem / low_total. ev_all =
   Σ remaining × tier_value / tickets_remaining_est − price. ev_ex_jackpot drops the
   launch-top tier. Columns: `game_id, as_of, capture_timestamp, price, tickets_printed,
   tickets_printed_implied_by_odds, lowest_tier_value, lowest_tier_remaining,
   lowest_tier_total, tickets_remaining_est, ev_all, ev_ex_jackpot, check_inputs, input_flags,
   method_note`.
5. **Validation:**
   - remaining = total − paid in every tier.
   - Stated tickets printed equals the median of totalPrizes × tier-odds denominator in **all
     89** captures (max relative difference 0.0).
   - No capture lacked a tickets-printed figure, a tier value or a nonzero lowest tier, so no
     point was skipped.

### Hand-check (recomputed with a separate stdlib script from the raw bytes)

**Game 469, captured 2025-01-13, $10 ticket.** Lowest tier is $20 (the table has no $10 tier).

- tickets remaining = 16,128,000 × 2,189,084 / 2,257,920 = 16,128,000 × 0.969513 =
  **15,636,314.3**
- Σ remaining × value over 9 tiers = **132,490,755**
- ev_all = 132,490,755 / 15,636,314.3 − 10 = 8.4733 − 10 = **−1.5267**
- ev_ex_jackpot: the launch top tier is 3 left × 4,000,000 = 12,000,000, so
  (132,490,755 − 12,000,000) / 15,636,314.3 − 10 = 7.7058 − 10 = **−2.2942**
- The pipeline gives −1.526727 and −2.294172. **Match.**

**Game 452, captured 2026-05-02, $20 ticket.** It has an annuity top tier: $10M headline,
`prizeAmount` 6,500,000.

- tickets remaining = 12,096,000 × 433,702 / 1,693,440 = 7.142857 × 433,702 = **3,097,871.4**
- Σ remaining × value over 13 tiers = **51,080,215**
- ev_all = 51,080,215 / 3,097,871.4 − 20 = 16.4888 − 20 = **−3.5112**
- ev_ex_jackpot = (51,080,215 − 1 × 6,500,000) / 3,097,871.4 − 20 = 14.3906 − 20 = **−5.6094**
- The pipeline gives −3.511189 and −5.609404. **Match.**
- Sensitivity: valuing the top tier at its $10M headline gives ev_all 54,580,215 / 3,097,871.4 −
  20 = **−2.3813**. The annuity basis moves this point by about $1.13.

### Flags in `ev_history`

- **`check_inputs` (positive EV): 8 of 89 points.**
  - 7 have the lowest tier under 5% remaining: 0.7% (two captures of one game), 1.1%, 1.7%,
    2.6%, 3.6% and 4.7%. Late in a game's life the ratio estimate is unstable. Unsold or
    destroyed tickets still count as "remaining" prizes, so positive EV is an artifact, not a
    finding.
  - 2 of those 7 were already claims-only in the catalog capture of the same day.
  - 1 point has 13% of its lowest tier left, with jackpots unclaimed (ex-jackpot is negative).
  - 4 of the 8 are positive even ex-jackpot.
- **`input_flags`: 17 points.**
  - 10 points are for games tagged `Expiring Game` (claims-only) in the catalog capture nearest
    the same date (within 45 days).
  - 8 points have the lowest tier under 5% remaining.
  - 2 points (two new games, both captured 2026-06-11) carry a `prizeAmount` of 10% of the
    headline on their annuity tiers (100,000 for "$1,000,000 ($50K/YR/20YRS)"), with those
    tiers labelled `REGULAR`. Every later capture shows the full headline with `TOP`/`SECONDARY`
    labels. This looks like a launch-day data-entry state. Those two EVs understate. Use the
    later captures.
  - (Some points carry more than one flag.)

### Limits

- **Sparse and uneven.** 47% of points (42 of 89) are in June 2026. No game has a monthly series. The
  2023-11 to 2024-12 window has catalog captures only.
- **Selection bias.** Captures exist where people (or bots) opened game pages. Expiring, new and
  popular games are probably over-represented.
- **Capture date is the as-of.** The Lottery's tables carry no timestamp and are "updated
  hourly" on a best-effort basis. Dates are UTC.
- **The annuity valuation basis is unconfirmed** (cash option vs. cost). See Risks 1.
- **Lowest-tier method.** It assumes the lowest tier sells evenly with tickets. That breaks near
  the end of a game and for games whose smallest prize is above the ticket price (20 of 89
  points).
- **Not reproducible from here.** The tables are personal-use only. Rebuild locally with the
  scratch scripts.

Rebuild: `scripts/scratch/wayback/` (`wb.py` is the polite fetcher with a persistent 400-request
budget; `cdx.py`/`cdx2.py` list captures, `fetch.py` downloads, and `parse.py` builds the three
Parquet files and runs `uv run --with polars python parse.py`). Raw files and
`manifest.jsonl` (original url, capture timestamp, fetched_at, status, sha256) are under
`data/raw/wayback/`.

## Refresh plan (user-triggered, per PRD)

| Step | Calls | Notes |
| --- | --- | --- |
| Catalog | 1 × A1 | Status, deadlines, odds, identifiers. Diff against last snapshot to mark games closed. |
| Prizes (fast) | 1 × A2 | TOP/SECONDARY only. Enough for "top prizes remaining of total". |
| Prizes (full) | 134 × A3 (one per listed scratch game), ≥1.5 s apart ≈ 3.5 min | Needed for tickets printed, the original top prize, low-tier counts for EV, and largest unclaimed prize. Cache tickets-printed and tier totals per game. They are fixed at launch, so after the first fill only `paidPrizes` changes. |
| Retailers | Adaptive B1 sweep (300–800 calls), monthly at most | Or load a supplied / public-records file. Re-geocode new or changed addresses. |
| Validation | — | Per game: remaining = total − paid; remaining ≥ 0 and non-increasing between snapshots; tickets_printed ≈ totalPrizes × tier odds (within 0.1%); every A2 game present in A1. Reject the snapshot on failure. |

Store every raw response, timestamped, with a checksum in `snapshots`.

## Risks and caveats

1. **The `type: TOP` label and `prizeAmount` field are inconsistent.** In 512, TOP = $10,000 while
   a $200,000 tier is `REGULAR` with `prizeAmount: 0`. Annuity and for-life prizes carry a
   valuation in `prizeAmount` (6.5M for a $10M headline, 2M for "$2,500/WK/LF"). A1 `topPrize`
   sometimes disagrees too (433: A1 1,000,000 vs table "$1,000,000 A Year For Life" at 20,000,000).
   Show `prizeDescription` in the UI and compute from parsed amounts. Flag mismatches. In the EV
   panel, treat `prizeAmount` for annuity tiers as an assumption and say so.
2. **Prize tables are best-effort.** They are updated "hourly", the Lottery disclaims accuracy, and
   there is no as-of time. Use fetch time as the as-of stamp.
3. **Retailer coordinates are sometimes wrong.** In the 100 nearest to downtown Boston:
   `FRIENDLY LIQUOR, 65 MAIN STREET, CHICOPEE 01020` at 42.3584,-71.0576;
   `7-ELEVEN 37461, 304 BELMONT ST, BROCKTON`; `CUMBERLAND FARMS #6769, WESTBORO`;
   `HAZELTON GOLF CLUB, REHOBOTH` (ZIP 02210). These look like defaults or bad geocodes. **Do not
   trust lat/lon as given.** Re-geocode from the address, or at least check the point is inside the
   ZIP/town polygon, and store `geocode_quality`. Those rows also distort a tiled sweep's density.
4. **The locator has no instant-ticket flag,** and B1 shows only currently active agents. "Licensed
   retailers" in the map is therefore "agents listed by the locator on {date}".
5. **Terms limit reuse:** personal, non-commercial only, no republishing. Fine for a local tool.
   Don't publish data, screenshots of tables or exports beyond personal use.
6. **Undocumented API:** endpoints, field names and the bundle filename can change without notice.
   Pin parsers to field names, fail loudly and keep raw files.
7. **e-Instant / Online** games and claims are a separate product. Exclude them from scratch views
   and map metrics.
8. **Closed games** vanish from A1/A2, so `game_id`s seen in winners history may not resolve without
   our own `games_seen` table or the Wayback captures.

## Not confirmed

- The current official count of licensed retailers.
- Whether every locator agent sells instant tickets.
- Whether a claimed top tier is ever removed rather than kept at `prizesRemaining: 0` (kept in the
  sampled games).
- How exactly `prizeAmount` is valued for annuity tiers (cash option vs. cost).
- Whether winners' `retailer` is the selling store or the claim location (the PRD's open question;
  the API field name `retailer` does not settle it).
- Whether a bulk retailer export exists outside the public site.
