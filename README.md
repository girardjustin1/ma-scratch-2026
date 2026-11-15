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

Your places: the **Settings** tab looks up an address (with `GOOGLE_MAPS_API_KEY` in
`web/.env.local`), saves it on this computer, and makes the map, the radius and new reports
center on it.

Data files live in `data/` and are never committed. See `docs/research/` for sources.

## Public demo

https://girardjustin1.github.io/ma-scratch-2026/ is the app on made-up sample data, with
Storybook at `/storybook/`. It redeploys on every merge to `main`
(`.github/workflows/pages.yml`). It never holds Lottery data: claims, games, stores and
reports there are synthetic, the network toggle is off, and there is no Google place panel or
Mapbox basemap. The real dashboard runs only locally.

```bash
cd web
npm run build:pages   # demo build in web/dist-pages, then scripts/check-pages.mjs
```

## Daily data job

`scripts/update_data.py` refreshes the local data. It is safe to run more than once a day.

1. **Winners list:** fetches every listed day that is missing, through yesterday (New York
   time). One request per day. A day the Lottery has not posted yet is asked for again on the
   next run.
2. **Game catalog and prize tables:** fetched at most once a day.
3. **Retailers:** a new statewide sweep runs only when the last one is more than 30 days old,
   because it takes about 175 requests. New or changed addresses are not geocoded
   automatically, so they stay off the map until you run the job by hand with
   `--geocode-new`.
4. **Rebuild:** when any input changed, it rebuilds `data/processed/`,
   `web/public/local/view.json` and `pace.json`.
5. **Reports:** runs `npm --prefix web run reports:publish`.

It only contacts `www.masslottery.com`, waits at least 1.3 s between requests and retries
with backoff. It never overwrites a raw file, and a lock file stops two runs from
overlapping. Everything it writes is gitignored.

- **Schedule:** daily at 07:15 local time, run by launchd
  (`com.girardjustin.ma-scratch.update`). Install or reinstall with
  `sh scripts/install_update_job.sh`. The template is in `scripts/launchd/`.
- **Logs:** `data/logs/update.out.log` and `update.err.log`. launchd creates these files
  itself, so never delete, rotate or recreate them from a shell. If you do, the job fails
  with EX_CONFIG.
- **Run by hand:**
  `uv run --with duckdb --with pandas --with pyarrow --with numpy --with shapely python3 scripts/update_data.py`
  (add `--rebuild` to force a rebuild, or `--no-publish` to skip reports). To run the
  scheduled job right away: `launchctl kickstart -k gui/$(id -u)/com.girardjustin.ma-scratch.update`.
- **Uninstall:** `launchctl bootout gui/$(id -u)/com.girardjustin.ma-scratch.update`, then
  `rm ~/Library/LaunchAgents/com.girardjustin.ma-scratch.update.plist`.
