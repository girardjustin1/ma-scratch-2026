"""Fetch the Lottery's public winners list, one request per listed day.

Saves data/raw/lottery_winners/daily/<YYYY-MM-DD>.json and appends a row to
data/raw/lottery_winners/manifest.csv (same format as the original backfill). Fetches every
listed day with no saved file, from the first saved day through yesterday (America/New_York).

The Lottery posts a day's list after the day ends; once posted it does not change. A day
that still answers 0 rows within GRACE_DAYS of today is treated as "not posted yet": nothing
is saved, and the next run asks again. Older empty days are saved as genuinely empty. A
legacy empty file inside the grace window is re-asked; if rows have appeared, the old file
is moved (never deleted) to daily_superseded/ and the new one saved.

    uv run python3 scripts/fetch_winners.py
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from lottery_http import FetchError, get, save_new

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/lottery_winners"
DAILY = RAW / "daily"
SUPERSEDED = RAW / "daily_superseded"
MANIFEST = RAW / "manifest.csv"
FAILLOG = RAW / "backfill_failures.log"
BASE = "https://www.masslottery.com/api/v1/winners/query"
COUNT = 2000  # one page per day; a day over this raises instead of truncating
GRACE_DAYS = 3
FIELDS = ["date", "url", "fetched_at", "http_status", "row_count", "api_total", "count_match", "sha256", "file"]
NY = ZoneInfo("America/New_York")


def today_ny() -> dt.date:
    return dt.datetime.now(NY).date()


def saved_days() -> dict[str, Path]:
    return {p.stem: p for p in DAILY.glob("*.json")}


def rows_in(path: Path) -> tuple[int, int]:
    d = json.loads(path.read_bytes())
    return len(d["pageOfWinners"]), d["totalNumberOfWinners"]


def append_manifest(row: list) -> None:
    new = not MANIFEST.exists()
    with MANIFEST.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(FIELDS)
        w.writerow(row)


def fetch_day(day: dt.date, today: dt.date, replace: Path | None = None) -> dict:
    """Ask for one day. Returns {'day', 'status': saved|not_posted|failed, 'rows', 'total'}."""
    ds = day.isoformat()
    url = f"{BASE}?start_index=0&count={COUNT}&date_from={ds}&date_to={ds}"
    try:
        status, body, _ = get(url)
        if status != 200:
            raise FetchError(f"HTTP {status}")
        data = json.loads(body)
        rows, total = len(data["pageOfWinners"]), data["totalNumberOfWinners"]
        if total > COUNT:
            raise FetchError(f"total {total} exceeds page size {COUNT}")
    except (FetchError, ValueError, KeyError) as e:
        with FAILLOG.open("a") as f:
            f.write(f"{ds}\t{url}\t{str(e)[:200]}\n")
        return {"day": ds, "status": "failed", "error": str(e)[:200]}
    if total == 0 and (today - day).days <= GRACE_DAYS:
        return {"day": ds, "status": "not_posted", "rows": 0, "total": 0}
    path = DAILY / f"{ds}.json"
    if replace is not None:
        if total == 0:
            return {"day": ds, "status": "not_posted", "rows": 0, "total": 0}
        stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
        SUPERSEDED.mkdir(parents=True, exist_ok=True)
        replace.rename(SUPERSEDED / f"{ds}.{stamp}.json")
    save_new(path, body)
    append_manifest([ds, url, dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), status, rows, total,
                     int(rows == total), hashlib.sha256(body).hexdigest(), f"daily/{ds}.json"])
    return {"day": ds, "status": "saved", "rows": rows, "total": total, "match": rows == total}


def update(today: dt.date | None = None) -> list[dict]:
    """Fetch every missing day through yesterday. Returns one result per day asked."""
    today = today or today_ny()
    yesterday = today - dt.timedelta(days=1)
    DAILY.mkdir(parents=True, exist_ok=True)
    have = saved_days()
    if not have:
        raise SystemExit("no saved winners days: run the original backfill first")
    first = min(dt.date.fromisoformat(d) for d in have)
    results = []
    d = first
    while d <= yesterday:
        ds = d.isoformat()
        if ds not in have:
            results.append(fetch_day(d, today))
        elif (today - d).days <= GRACE_DAYS:
            try:
                _rows, total = rows_in(have[ds])
            except (ValueError, KeyError):
                total = -1
            if total == 0:
                results.append(fetch_day(d, today, replace=have[ds]))
        d += dt.timedelta(days=1)
    return results


def main() -> None:
    res = update()
    for r in res:
        print(r)
    if not res:
        print("winners: nothing missing")


if __name__ == "__main__":
    main()
