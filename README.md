# ma-scratch-2026

Local, offline-first dashboard exploring how Massachusetts scratch-ticket claims listed by the
Lottery (prizes of about $600 and up) relate to Census tract income, geography, game and date.

Descriptive only. It never predicts or ranks winning stores.

## Run it

```bash
cd web
npm install
npm run dev         # prototype on http://127.0.0.1:5180
npm run storybook   # design system on http://127.0.0.1:6020
```

Optional: put a Mapbox public token in `web/.env.local` as `VITE_MAPBOX_TOKEN=...` to enable
the online streets basemap. Without it the map runs on bundled outlines, fully offline.

Data files live in `data/` and are never committed. See `docs/research/` for sources.
