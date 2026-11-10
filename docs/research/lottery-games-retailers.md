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
  this before it runs. It was not done in this sample pass.
- **No history:** the locator shows current agents only. Maintain `first_seen` / `last_seen` from
  repeated sweeps (the PRD's `retailers` table already has them).

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
