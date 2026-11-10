"""Fetch today's prize tables for every scratch game in the latest Lottery catalog.

Reads the newest data/raw/lottery_games/*_games.json, requests each Scratch game's prize
table once (about one request a second), keeps the raw JSON under data/raw/lottery_games/,
and writes data/processed/prizes_remaining_current.parquet (one row per game x tier).

All of data/ is gitignored: Lottery terms allow personal download only, no redistribution.

    uv run --with duckdb python3 scripts/fetch_prizes_remaining.py
"""

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/lottery_games"
OUT = ROOT / "data/processed/prizes_remaining_current.parquet"
URL = "https://www.masslottery.com/api/v1/instant-game-prizes?gameID={}"
UA = "ma-scratch-2026 personal research (local, non-commercial)"
PAUSE_S = 1.0


def main():
    catalog_file = sorted(RAW.glob("*_games.json"))[-1]
    games = [g for g in json.loads(catalog_file.read_text()) if g["gameType"] == "Scratch"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    as_of = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows, failed = [], []
    for i, g in enumerate(games):
        try:
            req = urllib.request.Request(URL.format(g["id"]), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
            (RAW / f"{stamp}_instant-game-prizes_gameID-{g['id']}.json").write_bytes(body)
            d = json.loads(body)
            for t in d["prizeTiers"]:
                rows.append((g["id"], g["identifier"], g["name"].strip(), g.get("price"), g.get("startDate"),
                             ",".join(g.get("tags") or []), as_of, t["tierNumber"], t["prizeAmount"],
                             t.get("prizeDescription"), t["totalPrizes"], t["paidPrizes"], t["prizesRemaining"],
                             t.get("type")))
        except Exception as e:  # noqa: BLE001 - log and keep going; a missing game is reported, not zeroed
            failed.append((g["id"], g["identifier"], str(e)[:80]))
        if (i + 1) % 20 == 0:
            print(f"{i + 1}/{len(games)}")
        time.sleep(PAUSE_S)

    con = duckdb.connect()
    con.execute("""CREATE TABLE t (game_id BIGINT, identifier VARCHAR, name VARCHAR, price DOUBLE, start_date VARCHAR,
        tags VARCHAR, as_of VARCHAR, tier_number INT, prize_amount DOUBLE, prize_description VARCHAR,
        total BIGINT, paid BIGINT, remaining BIGINT, tier_type VARCHAR)""")
    con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    con.execute(f"COPY t TO '{OUT}' (FORMAT parquet)")
    print(f"{len(games) - len(failed)}/{len(games)} games, {len(rows)} tiers, as of {as_of} → {OUT.relative_to(ROOT)}")
    for f in failed:
        print("FAILED", *f)


if __name__ == "__main__":
    main()
