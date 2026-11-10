"""Build the prototype's local map view from real data: statewide (default) or the pin area.

Writes web/public/local/view.json, which is GITIGNORED: it holds Lottery rows, and the
Lottery's terms forbid redistribution. The prototype loads it if present; Storybook never
does and stays on sample data.

    uv run --with duckdb python3 scripts/build_local_view.py            # statewide
    uv run --with duckdb python3 scripts/build_local_view.py --pin-area # 10 mi around the pin
"""

import sys

import json
import math
import os
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data/processed"
OUT = ROOT / "web/public/local/view.json"
TRACT_RADIUS_MI = 12  # draw a ring of no-data tracts beyond the 10 mi coverage edge
COVERAGE_MI = 10  # the retailer sweep is proven complete to this radius
RELEASE = "2020-2024"
LOW_MATCH_MIN_CLAIMS = 50  # towns with fewer listed claims get no match-rate flag


def load_pin() -> tuple[float, float]:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("DEFAULT_PIN="):
            lon, lat = line.split("=", 1)[1].split(",")
            return float(lon), float(lat)
    raise SystemExit("DEFAULT_PIN missing from .env")


def miles(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def round_coords(x):
    if isinstance(x, list):
        return [round_coords(v) for v in x] if x and isinstance(x[0], list) else [round(v, 5) for v in x]
    return x


def main():
    statewide = "--pin-area" not in sys.argv
    pin = load_pin()
    con = duckdb.connect()
    claims_file = P / ("claims_tract_ma.parquet" if statewide else "claims_pin_area.parquet")
    retailers_file = P / ("retailers_ma.csv" if statewide else "retailers_pin_area.csv")
    in_area = "covered" if statewide else "within_complete_radius"

    tracts = []
    for f in json.loads((P / "tracts_ma.geojson").read_text())["features"]:
        p = f["properties"]
        c = (p["inner_lon"], p["inner_lat"])
        if statewide or miles(c, pin) <= TRACT_RADIUS_MI:
            tracts.append({
                "type": "Feature",
                "geometry": {"type": f["geometry"]["type"], "coordinates": round_coords(f["geometry"]["coordinates"])},
                "properties": {"geoid": p["GEOID"], "name": p["NAMELSAD"], "town": p["town"], "county": p["county"],
                               "centroid": [round(c[0], 5), round(c[1], 5)]},
            })
    geoids = {t["properties"]["geoid"] for t in tracts}

    income = []
    for geoid, est, moe, hh, flag, rel in con.execute(
        f"SELECT lpad(geoid::VARCHAR, 11, '0'), median_income, moe, households, flag, reliability "
        f"FROM read_csv_auto('{P / 'tract_income.csv'}') WHERE acs_release = '{RELEASE}'"
    ).fetchall():
        if geoid in geoids:
            income.append({"geoid": geoid, "acsRelease": "2020–2024 ACS 5-year", "medianIncome": est, "moe": moe,
                           "households": hh or 0,
                           "flag": "suppressed" if est is None else ("high_moe" if rel == "low" else "ok")})

    # Only Census-verified retailers inside the complete sweep get placed.
    retailers = [
        {"id": str(rid), "name": name, "address": addr, "town": town, "lon": lon, "lat": lat, "tractGeoid": tract}
        for rid, name, addr, town, lon, lat, tract in con.execute(
            f"SELECT retailer_id, name, address, town, census_lon, census_lat, lpad(tract_geoid::VARCHAR, 11, '0') "
            f"FROM read_csv_auto('{retailers_file}') "
            f"WHERE {in_area} AND tract_geoid IS NOT NULL AND NOT coalesce(coord_flag, false) "
            f"AND census_lon IS NOT NULL"
        ).fetchall()
    ]
    placed = {r["id"] for r in retailers}

    rows = con.execute(
        f"SELECT strftime(listed_date, '%Y-%m-%d'), game_identifier, game_name, prize_amount_usd, retailer_id::VARCHAR "
        f"FROM read_parquet('{claims_file}') WHERE tract_geoid IS NOT NULL ORDER BY listed_date"
    ).fetchall()
    rows = [r for r in rows if r[4] in placed]

    prices = dict(con.execute(
        f"SELECT identifier, arg_max(price, snapshot_date) FROM read_parquet('{P / 'games_history.parquet'}') "
        f"WHERE identifier IS NOT NULL GROUP BY 1"
    ).fetchall())
    game_ids = sorted({r[1] for r in rows})
    names = {r[1]: r[2].strip() for r in rows}
    games = [{"id": g, "name": names[g], "price": prices.get(g)} for g in game_ids]
    gidx = {g: i for i, g in enumerate(game_ids)}

    # Per-municipality match rates: what share of the town's listed scratch claims matched a
    # retailer, and what share could be placed in a Census-verified tract.
    town_match = {}
    if statewide:
        for town, total, matched, placed in con.execute(f"""
            WITH all_claims AS (
              SELECT m.municipality, count(*) AS total
              FROM read_parquet('{P / 'claims_scratch.parquet'}') c
              JOIN read_csv_auto('{P / 'location_municipality_map.csv'}') m ON c.retailer_location = m.location
              WHERE m.municipality IS NOT NULL AND m.municipality <> 'AMBIGUOUS'
              GROUP BY 1),
            matched AS (
              SELECT municipality, count(*) AS matched, count(tract_geoid) AS placed
              FROM read_parquet('{claims_file}') GROUP BY 1)
            SELECT a.municipality, a.total, coalesce(m.matched, 0), coalesce(m.placed, 0)
            FROM all_claims a LEFT JOIN matched m USING (municipality)
            WHERE a.total >= {LOW_MATCH_MIN_CLAIMS}""").fetchall():
            town_match[town] = {"total": total, "matched": matched, "placed": placed}

    out = {
        "note": "LOCAL ONLY. Mass Lottery data: personal, non-commercial use; do not redistribute.",
        "coverage": {"label": "statewide" if statewide else f"{COVERAGE_MI} mi around your pin", "center": list(pin),
                     "radiusMiles": 0 if statewide else COVERAGE_MI, "statewide": statewide,
                     "dateFrom": rows[0][0], "dateTo": rows[-1][0]},
        "tracts": {"type": "FeatureCollection", "features": tracts},
        "income": income,
        "retailers": retailers,
        "games": games,
        "townMatch": town_match,
        # Compact claims: [listedDate, gameIndex, prizeAmount, retailerId]
        "claims": [[d, gidx[g], amt, rid] for d, g, _, amt, rid in rows],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(tracts)} tracts, {len(income)} income rows, {len(retailers)} placed retailers, "
          f"{len(rows):,} claims, {len(games)} games, {out['coverage']['dateFrom']} → {out['coverage']['dateTo']} "
          f"→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    os.chmod(OUT, 0o600)


if __name__ == "__main__":
    main()
