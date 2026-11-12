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

## Hexagon layer

- Layers → Tracts | Hexagons. `web/src/domain/hexes.ts` sums the filtered listed claims of the
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
- Notification is in-app only: unread count on the Reports tab and "new" markers, kept in this
  browser's localStorage. No system notifications.
- Honesty rules as in the app: every +EV estimate above 100% carries "Check inputs" and a
  reason, never "a sure thing"; the area is "your pin", never the address.
- Stories use SYNTHETIC `emails/fixtures.ts` and `fixtures/sampleReports.ts`.

## Data handling

- `data/` and `.env*` are gitignored and never committed. The repo is **public**, and the
  Lottery's terms allow personal, non-commercial download only, with no redistribution.
- Census data is public domain; `web/src/fixtures/census_sample.json` is built from it by
  `scripts/build_design_fixture.py`. Never put Lottery data in fixtures.
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
