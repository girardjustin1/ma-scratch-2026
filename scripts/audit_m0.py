"""Milestone 0 data audit: print format, fields, row counts, date windows and coverage
for every processed dataset. Reads data/ only; writes nothing.

    uv run --with duckdb python3 scripts/audit_m0.py
"""

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data/processed"
con = duckdb.connect()

DATE_COLS = ("listed_date", "snapshot_date", "as_of", "first_seen")


def reader(path: Path) -> str:
    if path.suffix == ".parquet":
        return f"read_parquet('{path}')"
    if path.suffix == ".csv":
        return f"read_csv_auto('{path}', header=true)"
    raise ValueError(path)


def describe(path: Path) -> None:
    src = reader(path)
    cols = con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()
    n = con.execute(f"SELECT count(*) FROM {src}").fetchone()[0]
    size = path.stat().st_size / 1e6
    print(f"\n## {path.relative_to(ROOT)}  ({path.suffix[1:]}, {size:.2f} MB, {n:,} rows)")
    print("fields:", ", ".join(f"{c[0]}:{c[1]}" for c in cols))
    names = {c[0] for c in cols}
    for d in DATE_COLS:
        if d in names:
            lo, hi, k = con.execute(f"SELECT min({d}), max({d}), count(DISTINCT {d}) FROM {src}").fetchone()
            print(f"{d}: {lo} → {hi} ({k:,} distinct)")
    for c in ("retailer_location", "municipality", "town", "town_name", "county"):
        if c in names:
            k = con.execute(f"SELECT count(DISTINCT {c}) FROM {src}").fetchone()[0]
            print(f"distinct {c}: {k:,}")
    for c in ("geoid", "tract_geoid", "game_identifier", "game_id", "retailer_id", "id"):
        if c in names:
            k, nulls = con.execute(f"SELECT count(DISTINCT {c}), count(*) - count({c}) FROM {src}").fetchone()
            print(f"distinct {c}: {k:,} (nulls {nulls:,})")
    if "prize_amount_usd" in names:
        lo, hi, under = con.execute(
            f"SELECT min(prize_amount_usd), max(prize_amount_usd), count(*) FILTER (WHERE prize_amount_usd <= 600) FROM {src}"
        ).fetchone()
        print(f"prize_amount_usd: {lo:,.0f} → {hi:,.0f}; rows ≤ $600: {under}")
    if "acs_release" in names:
        print("acs_release:", con.execute(f"SELECT acs_release, count(*) FROM {src} GROUP BY 1 ORDER BY 1").fetchall())
    if "flag" in names:
        print("flag:", con.execute(f"SELECT flag, count(*) FROM {src} GROUP BY 1 ORDER BY 2 DESC").fetchall())


def geojson(path: Path) -> None:
    con.execute("INSTALL spatial; LOAD spatial;")
    n = con.execute(f"SELECT count(*) FROM ST_Read('{path}')").fetchone()[0]
    print(f"\n## {path.relative_to(ROOT)}  (geojson, {path.stat().st_size / 1e6:.2f} MB, {n:,} features)")


def joins() -> None:
    print("\n## Joins")
    tracts = f"ST_Read('{P / 'tracts_ma.geojson'}')"
    inc = reader(P / "tract_income.csv")
    print("income geoids without polygon:", con.execute(
        f"SELECT count(DISTINCT i.geoid) FROM {inc} i ANTI JOIN {tracts} t ON lpad(i.geoid::VARCHAR, 11, '0') = t.GEOID").fetchone()[0])
    print("polygons without income:", con.execute(
        f"SELECT count(*) FROM {tracts} t ANTI JOIN {inc} i ON lpad(i.geoid::VARCHAR, 11, '0') = t.GEOID").fetchone()[0])
    scratch = reader(P / "claims_scratch.parquet")
    games = P / "games_history.parquet"
    if games.exists():
        print("scratch game slugs without a catalog row:", con.execute(
            f"SELECT count(DISTINCT game_identifier) FROM {scratch} s "
            f"ANTI JOIN {reader(games)} g ON s.game_identifier = g.identifier").fetchone()[0])
    print("scratch rows by weekday (0=Sun):", con.execute(
        f"SELECT dayofweek(listed_date) d, count(*) FROM {scratch} GROUP BY 1 ORDER BY 1").fetchall())


if __name__ == "__main__":
    for f in sorted(P.glob("*")):
        if f.suffix in (".parquet", ".csv"):
            describe(f)
        elif f.suffix == ".geojson":
            geojson(f)
    joins()
