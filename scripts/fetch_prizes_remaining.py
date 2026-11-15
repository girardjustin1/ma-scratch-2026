"""Refresh the Lottery's game catalog, then today's prize table for every scratch game in it.

1. Catalog: GET /api/v1/games once, saved as data/raw/lottery_games/<stamp>_games.json
   (skipped when a catalog from today, America/New_York, is already saved).
2. Prize tables: GET /api/v1/instant-game-prizes?gameID=<id> per Scratch game in the newest
   catalog (one request per 1.3 s), each saved raw under data/raw/lottery_games/, then
   data/processed/prizes_remaining_current.parquet (one row per game x tier) is rewritten.
   Skipped when that parquet is already from today. A game whose table cannot be fetched
   keeps its previous rows (with their older as_of), and is reported.

Every raw save is appended to data/raw/lottery_games/manifest.csv. All of data/ is
gitignored: Lottery terms allow personal download only, no redistribution.

    uv run --with duckdb python3 scripts/fetch_prizes_remaining.py [--force]
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import duckdb
from lottery_http import FetchError, get, save_new

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/lottery_games"
OUT = ROOT / "data/processed/prizes_remaining_current.parquet"
MANIFEST = RAW / "manifest.csv"
CATALOG_URL = "https://www.masslottery.com/api/v1/games"
PRIZES_URL = "https://www.masslottery.com/api/v1/instant-game-prizes?gameID={}"
MIN_SCRATCH_GAMES = 30  # a catalog with fewer scratch games is treated as a bad answer
FIELDS = ["kind", "url", "fetched_at", "http_status", "sha256", "file"]
NY = ZoneInfo("America/New_York")


def today_ny() -> dt.date:
    return dt.datetime.now(NY).date()


def stamp_date_ny(name: str) -> dt.date:
    """NY calendar date of a raw file named <YYYYmmddTHHMMSSZ>_..."""
    t = dt.datetime.strptime(name[:16], "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.UTC)
    return t.astimezone(NY).date()


def latest_catalog() -> Path:
    return max(RAW.glob("*_games.json"))


def log(kind: str, url: str, status: int, body: bytes, path: Path) -> None:
    new = not MANIFEST.exists()
    with MANIFEST.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(FIELDS)
        w.writerow([kind, url, dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), status,
                    hashlib.sha256(body).hexdigest(), path.name])


def fetch_catalog(force: bool = False) -> dict:
    """Save today's catalog unless one from today exists. Returns a summary dict."""
    cur = latest_catalog()
    if not force and stamp_date_ny(cur.name) == today_ny():
        return {"catalog": "skipped (already saved today)", "file": cur.name}
    status, body, headers = get(CATALOG_URL)
    if status != 200:
        raise FetchError(f"catalog HTTP {status}")
    games = json.loads(body)
    n = sum(1 for g in games if g.get("gameType") == "Scratch")
    if n < MIN_SCRATCH_GAMES:
        raise FetchError(f"catalog has only {n} scratch games; keeping {cur.name}")
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    path = RAW / f"{stamp}_games.json"
    save_new(path, body)
    save_new(RAW / f"{stamp}_games.headers.txt",
             (f"HTTP {status}\n" + "".join(f"{k}: {v}\n" for k, v in headers.items())).encode())
    log("catalog", CATALOG_URL, status, body, path)
    return {"catalog": "saved", "file": path.name, "scratch_games": n}


def prizes_as_of() -> str | None:
    if not OUT.exists():
        return None
    return duckdb.connect().execute(f"SELECT max(as_of) FROM read_parquet('{OUT}')").fetchone()[0]


def fetch_prizes(force: bool = False) -> dict:
    """Fetch every scratch game's prize table from the newest catalog and rewrite the parquet."""
    as_of = today_ny().isoformat()
    if not force and prizes_as_of() == as_of:
        return {"prizes": "skipped (already saved today)", "as_of": as_of}
    catalog_file = latest_catalog()
    games = [g for g in json.loads(catalog_file.read_text()) if g["gameType"] == "Scratch"]
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    rows, failed = [], []
    for i, g in enumerate(games):
        url = PRIZES_URL.format(g["id"])
        try:
            status, body, _ = get(url)
            if status != 200:
                raise FetchError(f"HTTP {status}")
            tiers = json.loads(body)["prizeTiers"]
            path = RAW / f"{stamp}_instant-game-prizes_gameID-{g['id']}.json"
            save_new(path, body)
            log("instant-game-prizes", url, status, body, path)
            for t in tiers:
                rows.append((g["id"], g["identifier"], g["name"].strip(), g.get("price"), g.get("startDate"),
                             ",".join(g.get("tags") or []), as_of, t["tierNumber"], t["prizeAmount"],
                             t.get("prizeDescription"), t["totalPrizes"], t["paidPrizes"], t["prizesRemaining"],
                             t.get("type")))
        except (FetchError, ValueError, KeyError) as e:  # reported, and the game keeps its previous rows
            failed.append((g["id"], g["identifier"], str(e)[:120]))
        if (i + 1) % 25 == 0:
            print(f"  prizes {i + 1}/{len(games)}", flush=True)
    if not rows:
        raise FetchError(f"no prize tables fetched ({len(failed)} failed); kept the previous parquet")

    con = duckdb.connect()
    con.execute("""CREATE TABLE t (game_id BIGINT, identifier VARCHAR, name VARCHAR, price DOUBLE, start_date VARCHAR,
        tags VARCHAR, as_of VARCHAR, tier_number INT, prize_amount DOUBLE, prize_description VARCHAR,
        total BIGINT, paid BIGINT, remaining BIGINT, tier_type VARCHAR)""")
    con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    carried = 0
    if failed and OUT.exists():
        ids = [f[1] for f in failed]
        con.execute(f"INSERT INTO t SELECT * FROM read_parquet('{OUT}') WHERE list_contains(?, identifier)", [ids])
        carried = con.execute("SELECT count(DISTINCT identifier) FROM t WHERE list_contains(?, identifier)", [ids]).fetchone()[0]
    tmp = OUT.with_name(OUT.name + ".part")
    con.execute(f"COPY t TO '{tmp}' (FORMAT parquet)")
    tmp.replace(OUT)
    return {"prizes": "saved", "as_of": as_of, "games": len(games) - len(failed), "of": len(games), "tiers": len(rows),
            "failed": failed, "carried_forward": carried, "catalog": catalog_file.name}


def main() -> None:
    force = "--force" in sys.argv
    print(fetch_catalog(force))
    res = fetch_prizes(force)
    print({k: v for k, v in res.items() if k != "failed"})
    for f in res.get("failed", []):
        print("FAILED", *f)


if __name__ == "__main__":
    main()
