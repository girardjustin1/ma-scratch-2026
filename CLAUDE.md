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

## Game pace

- `scripts/game_pace.py` → gitignored `web/public/local/pace.json`; types in
  `web/src/domain/pace.ts`, UI in `web/src/components/GamePace.tsx`.
- A listed claim counts toward a prize level only if its amount equals the level's value (or
  65% of it for annuities taken as cash). Buckets are used only if listed claims match the
  prize table's "paid" counts. Calls rank a game among same-price games at the same age.
- Pace describes how fast prizes HAVE been claimed, statewide. Never per store, never "due".
  Show the statewide-trend line with it: a market slowdown makes many games "behind".

## Insights emails

- `web/src/emails/`: React Email templates for sending with Resend. Three so far: weekly
  insights (trends, analysis, what's new), featured tickets, and +EV watch. Inline styles
  and tables (email clients), same monochrome look; shared parts in `parts.tsx`.
- Templates only lay out data passed in (`types.ts`); they compute nothing from claims.
- Same honesty rules as the app. Owner asked for +EV in email (2026-11-10): every estimate
  above 100% carries "Check inputs" and a reason, with the statewide banner; never call one
  a sure thing. Describe the area as "your pin", never the address.
- Stories (`Emails`) use `emails/fixtures.ts`, which is SYNTHETIC. Real emails are built
  from local data and never committed. Sending real data through Resend is the owner's
  call each time it is set up; nothing sends yet.

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
