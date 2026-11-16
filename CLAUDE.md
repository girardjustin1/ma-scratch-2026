# CLAUDE.md

Local, offline-first explorer of Massachusetts Lottery-listed scratch-ticket claims vs
Census tract income. Descriptive only: never predict or rank winning stores.
Spec: `docs/PRD.md`. Source research: `docs/research/`.

## Rules that override everything

- Missing coverage is **no data**, never zero (map, tooltips, stats, exports).
- Dates are **Lottery-listed dates**. Never "sale date", "win date", or a time of day.
- Claims are listed prizes **over $600** (the API's minimum is $601), located by the
  **selling** retailer's town. Not all wins.
- Retailer count is not sales volume. Tract income is not buyer income.
- Statewide EV never on the map or implying store inventory. It lives in the EV panel; the
  owner also allowed (2026-11-10) an "estimated payback" sort in the game picker list, with
  the statewide banner and every positive estimate flagged "check inputs". Never on map
  layers, tooltips, store cards or the place panel.
- Legacy EV estimates are read-only.
- Statistics and ML show results only above their sample gates.
- Wording lives in `web/src/lib/copy.ts`; colors in `web/src/theme/tokens.ts`.

## UI system

- Untitled UI React (MIT, Tailwind v4 + React Aria), copied into `web/src/uui/` and imported
  as `@/components/...`. Keep those files close to upstream; app components live in
  `web/src/components/`.
- **Monochrome GUI.** Black, white and greys only (`web/src/theme/app.css` remaps every
  palette to neutral). The only color is on the map: tract fills, retailer bubbles, pin, and
  the legend swatches that key them, all from `tokens.ts` via MapLibre paint or inline style.
  Charts are grey. Status is icon + words, never color.
- Light/dark: `useMode()` from `web/src/theme/mode.tsx`; dark mode is `.dark-mode` on `<html>`.

## Map page controls

- Header = **what data**: one row of filter buttons (`FilterBar` in `components/Controls.tsx`):
  location, radius, listed dates, games, prize size, stores by listed claims. Each button shows
  its value and opens a panel. A filter off its default gets a dark outline; Reset shows only
  then. A summary line (count, covered tracts, coverage) sits under the row.
- On the map = **how it is drawn** (`MapToolbar`): metric dropdown, basemap, Layers panel
  (tracts/hexagons, fills, bubbles), side by side. It passes clicks through between controls.
- Filter rules live in `domain/filterState.ts`: limits, what counts as changed, and deep-link
  params (`from to games prices prize radius stores`). A bad or out-of-range param falls back
  for that filter alone. The pin is never written to a link.
- Basemap: Outline (our layers, offline) | Streets | Satellite (`map/mapStyle.ts`, Mapbox Static
  Tiles as raster, online + token only; picking one offline takes the app online). The choice
  is kept in this browser's localStorage (`ma-scratch:basemap`). Area fill defaults per
  basemap (`DEFAULT_FILL_OPACITY`) unless changed by hand. Basemap imagery is the one other
  place color appears; the GUI stays monochrome. No other tile hosts.

## Hexagon layer

- Layers panel → Tracts | Hexagons. `web/src/domain/hexes.ts` sums the filtered listed claims of the
  stores in each H3 cell (res 6/7/8 by zoom), in the browser, from the same claims as the bubbles.
- Hexagons are listed claims only: picking them sets the metric to claims and disables the
  census metrics; switching back restores the previous metric. Cells with no stores are blank.
- Descriptive, never a forecast or "hot zone": the hex study (`docs/hex-study.md`) found nothing
  beats past volume.

## Game pace

- `scripts/game_pace.py` → gitignored `web/public/local/pace.json`; types in
  `web/src/domain/pace.ts`, UI in `web/src/components/GamePace.tsx`.
- A listed claim counts toward a prize level only if its amount equals the level's value (or
  65% of it for annuities taken as cash). Buckets are used only if listed claims match the
  prize table's "paid" counts. Calls rank a game among same-price games at the same age.
- Pace describes how fast prizes HAVE been claimed, statewide. Never per store, never "due".
  Show the statewide-trend line with it: a market slowdown makes many games "behind".

## Reports (in the app; never emailed)

- Owner decision 2026-11-12: reports live in the app's Reports tab only. Nothing is emailed or
  sent anywhere; the Resend plan is dropped. Do not add sending.
- Designs: `web/src/emails/` React Email templates (inline styles, monochrome; shared parts in
  `parts.tsx`), rendered to HTML in the browser. They only lay out data passed in (`types.ts`).
- Publishing: `web/src/reports/reports.ts` (schedule, backfill, unread) and
  `web/scripts/publish-reports.ts` (`npm --prefix web run reports:publish`, run by the daily
  data job). Issues are frozen JSON under gitignored `web/public/local/reports/`; an existing
  issue is never rebuilt. Weekly Mon–Sun on Mondays, monthly on the 1st, featured and +EV
  weekly only with a prize table saved after the week, nearby daily when claims are listed
  within 1 mi. First run backfills (marked, never unread).
- Notification: unread count on the Reports tab and "new" markers (this browser's localStorage),
  plus one local macOS notification when a new weekly issue publishes (Mondays; owner asked for
  a Monday check of new winners, 2026-11-16). Text goes to osascript as arguments; it never
  fails the job; `--no-notify` or `MA_SCRATCH_NO_NOTIFY=1` turns it off. Nothing is emailed.
- Weekly issues list every listed claim in the area that week (`winners`), newest first.
- Honesty rules as in the app: every +EV estimate above 100% carries "Check inputs" and a
  reason, never "a sure thing"; the area is "your pin", never the address.
- Stories use SYNTHETIC `emails/fixtures.ts` and `fixtures/sampleReports.ts`.

## Settings: saved places

- The Settings tab (`/settings`) looks up an address with one Google Places Text Search
  through the local proxy (user-pressed, online only; matches outside MA are dropped), and
  saves places to the gitignored `web/public/local/settings.json` via the dev server's
  `/local-settings` endpoint (vite.config.ts). `src/settings/settings.ts` validates it.
- The active place replaces the default pin: the map's center and radius, and the area new
  reports describe (`scripts/publish-reports.ts` reads the file). Published issues keep theirs.
- The map header has a location button (active place · radius) that opens the location dialog
  (`src/settings/LocationDialog.tsx`; lookup shared with Settings via `PlaceSearch.tsx`). With
  no place saved, the dialog opens once at start; "Keep the default pin for now" is remembered
  in this browser's localStorage (`ma-scratch:location-prompt`). Off in the public demo.
- Address suggestions (online only): Places Autocomplete (New) through the proxy
  (`/google/places/places:autocomplete`, restricted to MA bounds server-side), 300 ms after
  typing stops, 3+ characters. A pick ends the session with one Essentials-tier details call
  (`/google/places/address/<id>`, mask `id,formattedAddress,location`), so a picked session's
  suggestions are not billed per request. Enter on a highlighted suggestion picks it and must
  not also run Look up (Text Search). The input is never logged or stored.
- A saved address is personal: never in a URL, a commit, a fixture or the public demo. The
  summary there (`src/settings/around.ts`) counts claims at stores within the radius, so it
  can differ from the map header's tract-based count; say so, never blend the two.

## Data handling

- `data/` and `.env*` are gitignored and never committed. The repo is **public**, and the
  Lottery's terms allow personal, non-commercial download only, with no redistribution.
- Census data is public domain; `web/src/fixtures/census_sample.json` is built from it by
  `scripts/build_design_fixture.py`. Never put Lottery data in fixtures.
- The GitHub Pages demo (`npm run build:pages`, `VITE_DEMO=1`) is sample data only. Its
  build ignores `.env*` files and `web/public/` (vite.config.ts, .storybook/main.ts), and
  `web/scripts/check-pages.mjs` fails it if local data or any `.env.local` value got in.
  Never weaken that guard or feed real data to the demo.
- Fetch politely: ≥1.2 s between Lottery requests, and only when the user asks.

## Commands

```bash
cd web && npm run dev          # prototype  http://127.0.0.1:5180
cd web && npm run storybook    # storybook  http://127.0.0.1:6020
cd web && npx tsc -p tsconfig.json
python3 scripts/build_design_fixture.py
```

## Git

Push, branch and open PRs only as `girardjustin1`, and only when the owner says to.
