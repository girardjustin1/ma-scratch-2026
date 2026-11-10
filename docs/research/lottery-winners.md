# Research: Mass Lottery winners list ("listed claims, $600+")

As of 2026-11-09. Research only, with no application code. Raw responses are in
`data/raw/lottery_winners/` and the normalized sample is `data/samples/claims_sample.csv`.
Both are gitignored.

## Bottom line

- **Source:** the Lottery's own Winners page, <https://www.masslottery.com/tools/winners>
  (also `/winners`). Its front end calls a public, unauthenticated JSON API:
  `GET https://www.masslottery.com/api/v1/winners/query`. No other official or
  open-data source was found.
- **Location = the retailer that sold the ticket (or ran the Keno game), not the place the
  prize was claimed.** No claimant town is published.
- **Listed date (`date_of_win`)**: for scratch tickets this behaves like the date the
  Lottery processed the claim. It is not the sale date. The Lottery does not define the
  field anywhere, so label it "Listed date".
- **Threshold:** prizes **over $600**. The smallest value in the whole dataset is $601.
- **Depth:** all $601+ draw and instant prizes start on **2020-12-15**. Draw-game grand
  prizes go back to January 2003. The 3-year window is fully covered.
- **Volume:** the API reports **566,392 rows statewide** for 2023-11-09 → 2026-11-08 (all
  games). The backfill (done 2026-11-09) retrieved **566,382**, of which **371,879** are
  retail scratch. The 10-row shortfall is draw-game rows the API counts but never returns.
  See "Backfill results".

## Source ranking

| Rank | Source | Official? | Completeness for 3y statewide | Notes |
| --- | --- | --- | --- | --- |
| 1 | `masslottery.com/api/v1/winners/query` (JSON behind `/tools/winners`) | Yes, the Lottery's own site | Complete: every $601+ claim since 2020-12-15, filterable by date | Used for the sample. No auth, CORS `*`, Heroku origin. |
| 2 | `masslottery.com/tools/winners` (rendered page) | Yes | Same data, 25 rows/page in the UI | Location column renders as "Town - Retailer". |
| 3 | Public-records request (publicrecords@masslottery.com) | Yes | Unknown | The Lottery's public-records page says winners are already available at `/winners`: "The following records can be found on www.masslottery.com: … Lottery Winners". Only useful for fields the site doesn't publish (e.g. claim vs sale date). |
| 4 | News (MassLive, WWLP monthly "winners" roundups), lotterymap.com | No, secondary | Large prizes only | Good for spot-validating rows. Not a dataset. |
| — | data.mass.gov, CTHRU | — | Not found | No Lottery prize/claims dataset turned up. CTHRU covers spending and payroll. Not confirmed exhaustively. |

## API (from the site's own JS bundle, `main.<hash>.js`, module `WinnersApi`)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/winners/query` | Paged rows → `{"pageOfWinners":[…], "totalNumberOfWinners":N}` |
| `GET /api/v1/winners/all-games` | 364 `{identifier, name}`, covering draw, iLottery and instant games |
| `GET /api/v1/winners/all-cities` | 439 location strings, including `"Online"` |

Query parameters (from `fetchPageOfWinners`):

- Paging: `start_index` (0-based) and `count`. The UI uses 25. `count=1000` and
  `count=2000` both worked.
- Date filters: `date_from` and `date_to` (`YYYY-MM-DD`, inclusive).
- `games`: comma-separated identifiers.
- `cities`: comma-separated location strings.
- `prize_amounts`: one of `600-4999`, `5000-9999`, `10000-24999`, `25000-49999`,
  `50000-99999`, `100000-999999`, `1000000-`.
- `sort`: `newestFirst`, `oldestFirst`, `highPrizesFirst` or `lowPrizesFirst`. The default
  appears to be newest date, then highest prize.

Page disclaimer in the bundle: *"Draw and instant game prizes over $600 since December 15,
2020. Draw game grand prizes since January 2003."*

## Field dictionary (per row)

| API field | Example | Meaning / caveat |
| --- | --- | --- |
| `date_of_win` | `2026-11-07` | **Listed date.** Day only, no time. For instants it tracks claim-processing days (see evidence below). For draw-game jackpots it may be the draw date (a $100k Mass Cash row dated Sun 2026-11-08 was already listed on 11-09), which is unconfirmed. Never call it sale date or win date. |
| `identifier` | `500000-frenzy`, `433`, `keno` | Game slug. It is **not** the instant game number (only `432`/`433` are numeric). Reorders and re-releases get separate slugs, and 16 names map to more than one slug. |
| `name` | `$500,000 FRENZY` | Display name. Sometimes has trailing spaces or ™. |
| `prize_amount_usd` | `5000` | Integer USD. For big prizes this is the **cash-option amount paid**, e.g. $10M Premier Cash is listed as `6500000` (press: "$6.5 million before taxes"). |
| `prize_amount_display` | `$5,000` | Equals the formatted USD in every backfilled row except 32 Lucky for Life rows, which show `$25,000 a Year for Life` with `prize_amount_usd = 500000`. That is the only annuity text seen. All scratch rows are plain dollar amounts. |
| `retailer` | `Richdale Food Shops 129` | Selling retailer's name. Often includes a store number. **No street address and no retailer ID.** Absent on Online rows and on a few retail rows (12 of ~2,900 in the 2026 week). |
| `retailer_location` | `E Falmouth`, `Dorchester`, `Online` | Retailer's **town or village/neighbourhood** (e.g. `N Billerica`, `W Yarmouth`, `Allston`), not a normalized municipality. `Online` = iLottery. |
| *(absent)* | — | No claim ID, no prize type (cash/annuity), no claimant name or town, no ticket price, no game number, no time of day. |

Game groups (derived; the API has no type field):

- **draw**: 10 identifiers (`keno`, `the_numbers_game`, `mass_cash`, `mass_3`, `mass_4`,
  `megabucks`, `mega_millions`, `powerball`, `lucky_for_life`, `millionaire_for_life`).
- **online_ilottery**: `retailer_location == "Online"` and not draw. These are eInstants
  like `the-lamp` and `mighty-mustang`, and they appear only in 2026 samples.
- **retail_presumed_instant**: everything else. This includes `keno-instant-ticket`
  (a scratch ticket, not the Keno draw game).
- Confirm against the game catalog (see the games/retailers research).

## Selling vs claiming: the location is the selling retailer

1. **Claims of $601+ cannot be paid at retailers.** Helpdesk, "Where can prizes between
   $601 and $50,000 be claimed?": *"Prizes of $601 up to and including $50,000 can be claimed
   at any Lottery office (Dorchester, Braintree, Lawrence, New Bedford, West Springfield, or
   Worcester). Claims of these values can also be claimed by mail-in process. Prizes of $601
   up to and including $5,000 can also be claimed using the Mass Lottery app's mobile
   cashing feature."* Yet one sample week has 1,486 distinct retailers in 309 locations for
   instant rows. If the list showed claim locations, there would be only 6 offices.
2. **Spot check.** The list row `2023-11-06 · $6,500,000 · $10,000,000 PREMIER CASH · Yujo
   Restaurant · Dracut` matches MassLive (2023-11-07): *"The player had bought their winning
   lottery ticket from a restaurant in Dracut called Yujo Restaurant."* The winner lives in
   Groveland, which does not appear in the list.

Conclusion: the location is the selling retailer and its town (for Keno, the agent where the
game was played). Confidence is high, but the Lottery publishes no field definition saying so.

## What the listed date means (evidence, not a definition)

- Retail-instant rows by weekday:
  - Week of 2026-11-01: Mon 521, Tue–Fri 306–352, Sat 84, Sun 87.
  - Week of 2023-11-05: Mon 621 (weekend backlog), Sun 69, Sat 90, and only 89 on Fri
    11-10 (Veterans Day observed, offices closed).
- **All 330 weekend instant rows are ≤ $5,000**, the mobile-cashing limit. On weekdays, 137
  instant rows were over $5,000.
- Premier Cash: the press says the prize was "claimed" and won "Monday", and the row is
  dated Mon 2023-11-06.

So for instants the listed date ≈ the date the claim was processed. The sale date is unknown
and can precede the listed date by days to a year. Draw and Keno rows spread evenly over all
7 days, so for those the date may be the draw/validation date. Not confirmed.

## Threshold

- Strictly over $600. `sort=lowPrizesFirst` over all 1,107,124 rows returns $601 first.
- Prizes of $600 and below never appear. A scratch tier of exactly $600 is invisible.
- The smallest common scratch values listed are $750 and $1,000.

## History and volume (exact counts from `totalNumberOfWinners`)

| Window (listed date) | Rows |
| --- | --- |
| All time (2003-01-03 → 2026-11-08) | 1,107,124 |
| 2020-12-01 → 2021-01-31 | 22,830 (first non-jackpot rows on 2020-12-15) |
| 2023-11-09 → 2024-11-08 | 180,972 |
| 2024-11-09 → 2025-11-08 | 177,278 |
| 2025-11-09 → 2026-11-09 | 208,142 |
| **3 years, all games** | **566,392** |
| 3y, draw games (10 ids) | 151,714 |
| 3y, `cities=Online` | 42,870 (of which 71 are draw) |
| **3y, presumed retail scratch** (= all − draw − online non-draw) | **≈ 371,879** |

Sample weeks:

- 2023-11-05..11: 2,514 rows (1,553 instant, 961 draw, 0 online).
- 2026-11-01..07: 6,599 rows (1,991 instant, 931 draw, 3,677 online).

iLottery explains the 2026 growth. Busiest day seen: 1,088 rows (2026-11-06).

## Terms of use and robots.txt

- `https://www.masslottery.com/robots.txt` **does not exist**: the server returns the SPA
  HTML with status 200. There are no Disallow rules.
- Legal Notice (<https://www.masslottery.com/about/legal-notice>), "Restrictions on use":
  *"You may not modify, copy, reproduce, republish, upload, post, transmit or distribute in
  any way any material from this site … You may download material from this site for your
  personal, non-commercial use only, provided you keep intact all copyright and other
  proprietary notices."*
- Automated access is not mentioned. A polite local, personal, non-commercial fetch is
  allowed. **Republishing or distributing the data is not**, so the dashboard and exports
  must stay local, which matches the PRD.
- Player-account T&Cs apply only to logged-in users. No login was used.

## Sample fetched (this research)

- 26 requests to Lottery hosts:
  - robots.txt and the JS bundle.
  - all-games and all-cities.
  - 22 `winners/query` calls.
- Each request was 1.2–1.5 s apart, with UA
  `ma-scratch-2026-research/0.1 (personal non-commercial research; contact …)`.
- Every response returned 200 in ~0.2–1.4 s. There was no rate limiting or CAPTCHA.
- Raw files are named `<UTC fetch ts>__<label>.json`, each with a `.headers` file.
- `claims_sample.csv` has 9,113 rows: two full weeks, 2026-11-01..07 and 2023-11-05..11.
  Columns:
  - `listed_date`, `listed_weekday`
  - `game_identifier`, `game_name`, `game_group`
  - `prize_amount_usd`, `prize_amount_display`
  - `retailer_name`, `location_raw`, `is_online`
  - `dup_ordinal`, `source_file`, `source_start_index`, `fetched_at_utc`
- Pagination check: the single-day call (2026-11-06, `count=2000`, 1,088 rows) is
  multiset-identical to the same day taken from the week's 1000-row pages.
- **Correction after the backfill.** Offset paging across a multi-day range is not stable
  when rows tie.
  - The 2026 week pages dropped 3 Online $1,600 rows dated 2026-11-04 and returned 3 Keno
    $1,600 rows twice instead.
  - So `claims_sample.csv` has 3 wrong rows in the 2026 week.
  - The 2023 days that overlap the backfill (11-09..11) matched exactly.
  - Use `data/processed/claims_all.parquet`, not the sample.

## Backfill plan (as designed)

1. Fetch `all-games` and `all-cities` once (2 requests). Store them as a dated snapshot.
2. **One request per listed day**: `GET /api/v1/winners/query?start_index=0&count=2000&date_from=D&date_to=D`
   for D = 2023-11-09 … 2026-11-09 (1,097 days).
   - If `totalNumberOfWinners > 2000`, page with `start_index += 2000`. Not seen; the
     busiest day was 1,088 rows.
   - Day-sized pages avoid deep offsets and unstable tie ordering across pages.
3. Validate each day: the sum of rows equals `totalNumberOfWinners`. Spot-check the yearly
   totals above (180,972 / 177,278 / 208,142).
4. Keep raw JSON untouched. Normalize with **no de-duplication**: identical rows are separate
   claims (963 exact duplicates in one 2026 week, mostly online). Build the key as
   `(listed_date, identifier, prize_amount_usd, retailer, retailer_location, dup_ordinal)`.
5. Cost: about 1,099 requests. At 1 req/s plus ~0.4 s response time that is about
   **25–30 min**. Download size is about 105 MB of JSON (~185 B/row × 566k).
6. Refresh: re-fetch the trailing 14 days each time and compare per-day totals, because late
   additions are possible. This is append-only, as in the PRD.

## Backfill results (run 2026-11-10 01:20–01:52 UTC, i.e. evening of 11-09 ET)

How it ran:

- 1,096 day requests covering 2023-11-09 → 2026-11-08 inclusive, one page each with
  `count=2000`.
- Requests were at least 1.3 s apart, with the same UA.
- All returned HTTP 200, with 0 retries and 0 failures. No day exceeded 2,000 rows.
- 5 more diagnostic requests followed. Those files are in
  `data/raw/lottery_winners/diagnostics/`.

Outputs (all local and gitignored):

- `data/raw/lottery_winners/daily/YYYY-MM-DD.json`: untouched API bodies, 111 MB.
- `data/raw/lottery_winners/manifest.csv`, with columns:
  - `date`, `url`, `fetched_at`, `http_status`
  - `row_count`, `api_total`, `count_match`
  - `sha256`, `file`
- `data/processed/claims_all.parquet` (566,382 rows) and `claims_scratch.parquet`
  (371,879 rows). Columns:
  - `listed_date`, `game_identifier`, `game_name`
  - `prize_amount_usd`, `prize_amount_display`
  - `retailer`, `retailer_location`
  - `is_online`, `is_draw_game`, `source_day_file`
- Scratch = `not is_draw_game and not is_online`.
- `data/processed/claims_per_day.csv`: rows per day, all games and scratch.
- Every row's `date_of_win` equals its file's day.
- The scripts were throwaway and kept outside the repo.

Rows by 12-month window (listed date):

| Window | Scratch (retail) | Draw | Online iLottery | All |
| --- | --- | --- | --- | --- |
| 2023-11-09 → 2024-11-08 | 131,267 | 49,695 | 0 | 180,962 |
| 2024-11-09 → 2025-11-08 | 126,727 | 50,551 | 0 | 177,278 |
| 2025-11-09 → 2026-11-08 | 113,885 | 51,458 | 42,799 | 208,142 |
| **Total** | **371,879** | **151,704** | **42,799** | **566,382** |

Rows by calendar year:

| Year | Scratch | Draw | Online | All |
| --- | --- | --- | --- | --- |
| 2023 (from 11-09) | 16,878 | 6,866 | 0 | 23,744 |
| 2024 | 131,485 | 49,927 | 0 | 181,412 |
| 2025 | 125,501 | 51,171 | 0 | 176,672 |
| 2026 (to 11-08) | 98,015 | 43,740 | 42,799 | 184,554 |

Other observations:

- The first Online (iLottery) row is dated 2026-07-27.
- Prizes range from $601 to $29,710,000, the latter a draw jackpot.
- Scratch has 208 distinct game identifiers.

**Count mismatches (flagged in the manifest, `count_match = 0`).** On 8 days the API's
`totalNumberOfWinners` exceeds the rows it returns. The returned/reported counts are:

| Day | Returned / reported |
| --- | --- |
| 2023-11-24 | 665/666 |
| 2023-12-08 | 565/566 |
| 2023-12-15 | 555/556 |
| 2024-02-05 | 913/914 |
| 2024-02-17 | 258/259 |
| 2024-03-14 | 544/546 |
| 2024-04-01 | 855/857 |
| 2024-09-26 | 503/504 |

That is 10 rows in all, and they are all **draw-game** rows:

- Retrieved draw rows total 151,704, against 151,714 when the API is filtered to draw games.
  Scratch matches exactly.
- A re-fetch of 2024-03-14 gives the same 544/546.
- Filtering that day to Lucky for Life, Mass 3/4, Mega Millions, Megabucks, Millionaire for
  Life and Powerball returns `{"pageOfWinners":[],"totalNumberOfWinners":2}`. The API
  counts rows it never serves.
- These rows cannot be recovered through the API. The scratch subset is unaffected.

**Gap and zero days.** No day in the window has zero rows for all games.

- **Zero scratch rows:** only **Sun 2024-04-28** (111 draw rows that day). This is likely
  no mobile-app cashing that Sunday, but the cause is unconfirmed.
- **Weekdays with fewer than 60 scratch rows:**
  - Thanksgiving, when offices were closed: 2023-11-23 (45) and 2024-11-28 (51).
  - Mon 2026-01-26 (54) and Mon 2026-02-23 (37). Weather closures are possible; the cause is
    unconfirmed.
- On other holidays scratch rows fall to weekend levels (about 85–93), consistent with
  app-only cashing.
- **2023-11-07** falls before the backfill window. A single-day diagnostic fetch confirms
  it really has **0 scratch rows**, with 163 rows that are all draw games (Numbers 86,
  Keno 75, Mega Millions 2). It was a Tuesday, not a state holiday, and the cause is
  unknown. Treat it as a known gap in claims processing, not as missing API data.
- Mean scratch rows by weekday: Mon 554, Tue 443, Wed 380, Thu 376, Fri 446, Sat 93,
  Sun 85.

**Retailer strings, as input to the licensed-retailer join.**

- Scratch rows have **6,834 distinct (retailer, retailer_location) pairs** across 419
  location strings. 571 scratch rows have no retailer name, spread over many games.
- Across all non-online rows (scratch, Keno and draw) there are 7,652 distinct pairs
  across 424 locations.
- Top 20 `retailer_location` values for scratch rows:

  | Location | Rows | Location | Rows |
  | --- | --- | --- | --- |
  | Worcester | 12,137 | Quincy | 6,085 |
  | Dorchester | 8,139 | Peabody | 4,428 |
  | New Bedford | 7,331 | N Andover | 4,303 |
  | Springfield | 7,204 | Chicopee | 4,212 |
  | Brockton | 6,773 | E Boston | 4,206 |
  | Lynn | 6,547 | Attleboro | 4,071 |
  | Methuen | 6,219 | Waltham | 3,908 |
  | Fall River | 6,119 | Framingham | 3,889 |
  | Lowell | 6,106 | Haverhill | 3,798 |
  | Boston | 6,096 | Everett | 3,689 |

- Neighbourhood strings (Dorchester, E Boston, and others) must be rolled up to Boston
  before any per-municipality figure.

## Coverage manifest

| Field | Value |
| --- | --- |
| dataset | Mass Lottery listed claims (winners list) |
| source | `GET https://www.masslottery.com/api/v1/winners/query`, one request per day |
| date_from | 2023-11-09 (listed date) |
| date_to | 2026-11-08 (listed date) |
| area | Statewide (all Massachusetts retailers, plus `Online` for iLottery) |
| threshold | Strictly over $600 (minimum observed $601). Smaller prizes are never listed. |
| rows | 566,382 all games; 371,879 retail scratch |
| known gaps | 10 draw-game rows counted but not served by the API (8 days, listed above). No scratch gaps. |
| low/zero scratch days | 2024-04-28 (0, Sunday); 2023-11-23, 2024-11-28, 2026-01-26, 2026-02-23 (under 60 on a weekday). These are real low days, not missing data. |
| outside window | 2023-11-07 has 0 scratch rows (confirmed), before date_from |
| fetched | 2026-11-09 (US Eastern evening); raw bodies' sha256 in `manifest.csv` |
| redistribution | Not allowed (Lottery Legal Notice). Local use only. |

## Open risks / not confirmed

- **The date semantics are inferred.** The Lottery never defines `date_of_win`. Draw and
  Keno date meaning is unconfirmed.
- **There are no addresses or retailer IDs.** Geocoding needs a fuzzy join of name + town
  to a licensed-retailer list. Town strings are villages and neighbourhoods (363 distinct
  non-online values in the sample) and need mapping to the 351 municipalities.
- **The game join is by slug or name, not game number.** Slugs repeat names across
  reorders.
- **Instant vs other is derived**, by excluding the 10 draw ids and Online. Promotional
  tickets and second-chance prizes have not been checked.
- **Amounts are cash-option values for big prizes.** Only Lucky for Life shows annuity text.
  How a scratch winner who chose an annuity is listed is unknown. There is no prize-type
  field.
- **The API can count rows it does not serve.** 10 draw rows in this window are affected.
  Refresh checks must compare `row_count` with `api_total` and flag differences, as the
  manifest does.
- **Offset paging over multi-day ranges loses tied rows.** Always fetch one day per page.
- Day-level gaps: see Coverage manifest. There are no scratch gaps in the window.
  2023-11-07 (outside it) has 0 scratch rows, cause unknown.
- **Prizes of $600 and below are invisible**, and 2026 volume is inflated by iLottery.
- **The API is undocumented** and could change or be rate-limited without notice.
