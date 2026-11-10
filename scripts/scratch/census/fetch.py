"""Fetch raw Census inputs for MA (state 25). Writes untouched bytes + SOURCES.txt.
api.census.gov data endpoints now redirect to missing_key.html without a key (verified 2026-11-10 UTC),
so ACS values come from the keyless table-based Summary File on www2.census.gov."""
import hashlib, sys, time, urllib.request, datetime, pathlib

RAW = pathlib.Path(sys.argv[1]); RAW.mkdir(parents=True, exist_ok=True)
API = "https://api.census.gov/data"
SF = "https://www2.census.gov/programs-surveys/acs/summary_file"
jobs = []
for y in (2023, 2024):
    for t in ("b19013", "b11001", "b19301"):
        jobs.append((f"acs/acsdt5y{y}-{t}.dat", f"{SF}/{y}/table-based-SF/data/5YRData/acsdt5y{y}-{t}.dat"))
    jobs.append((f"acs/doc/ACS{y}5YR_Table_Shells.txt", f"{SF}/{y}/table-based-SF/documentation/ACS{y}5YR_Table_Shells.txt"))
    for v in ("B19013_001E", "B11001_001E", "B19301_001E"):
        jobs.append((f"acs/meta/acs5_{y}_var_{v}.json", f"{API}/{y}/acs/acs5/variables/{v}.json"))
    jobs.append((f"acs/meta/acs5_{y}_dataset.json", f"{API}/{y}/acs/acs5.json"))
for y in (2023, 2024):
    for lyr in ("tract", "cousub"):
        n = f"cb_{y}_25_{lyr}_500k.zip"
        jobs.append((f"geo/{n}", f"https://www2.census.gov/geo/tiger/GENZ{y}/shp/{n}"))
jobs.append(("geo/BlockAssign_ST25_MA.zip", "https://www2.census.gov/geo/docs/maps-data/data/baf2020/BlockAssign_ST25_MA.zip"))
jobs.append(("geo/tl_2020_25_tabblock20.zip", "https://www2.census.gov/geo/tiger/TIGER2020/TABBLOCK20/tl_2020_25_tabblock20.zip"))
for y in (2024, 2025):
    jobs.append((f"docs/acs_release_schedule_{y}.html", f"https://www.census.gov/programs-surveys/acs/news/data-releases/{y}/release-schedule.html"))
jobs.append(("docs/notes-on-acs-estimate-and-annotation-values.html",
             "https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html"))

lines = []
for rel, url in jobs:
    out = RAW / rel; out.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ma-scratch-2026 local research)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                body = r.read(); status = r.status; final = r.geturl()
            break
        except Exception as e:
            print("retry", rel, e); time.sleep(5)
    else:
        raise SystemExit(f"failed {url}")
    if final != url:
        raise SystemExit(f"redirected {url} -> {final}")
    out.write_bytes(body)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines.append(f"{rel}\t{url}\t{ts}\tHTTP {status}\t{len(body)} bytes\tsha256={hashlib.sha256(body).hexdigest()}")
    print(lines[-1][:150]); time.sleep(0.3)
(RAW / "SOURCES.txt").write_text(
    "# Raw Census downloads for ma-scratch-2026. Files are byte-for-byte as served (no edits).\n"
    "# Fetched by a throwaway script (not in repo). Columns: path, url, fetched_at_utc, status, size, sha256\n"
    + "\n".join(lines) + "\n")
