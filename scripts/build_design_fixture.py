"""Build the Storybook/prototype geometry fixture from processed Census files.

Clips 2020 Census tracts within RADIUS_MI of the sample pin and attaches the latest
ACS 5-year median household income. Census data is public domain, so this fixture can
be committed. Lottery data must never be written here (its terms forbid redistribution).

    python3 scripts/build_design_fixture.py
"""

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACTS = ROOT / "data/processed/tracts_ma.geojson"
INCOME = ROOT / "data/processed/tract_income.csv"
OUT = ROOT / "web/src/fixtures/census_sample.json"

CENTER = (-71.08, 42.36)  # sample pin; replace once the owner picks the opening location
RADIUS_MI = 12.5
RELEASE = "2020-2024"


def miles(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def round_coords(x):
    if isinstance(x, list):
        return [round_coords(v) for v in x] if x and isinstance(x[0], list) else [round(v, 5) for v in x]
    return x


def main():
    income = {}
    with INCOME.open() as f:
        for r in csv.DictReader(f):
            if r["acs_release"] == RELEASE:
                income[r["geoid"]] = r

    features, rows = [], []
    for f in json.loads(TRACTS.read_text())["features"]:
        p = f["properties"]
        c = (p["inner_lon"], p["inner_lat"])
        if miles(c, CENTER) > RADIUS_MI:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": f["geometry"]["type"], "coordinates": round_coords(f["geometry"]["coordinates"])},
            "properties": {
                "geoid": p["GEOID"], "name": p["NAMELSAD"], "town": p["town"],
                "county": p["county"], "centroid": [round(c[0], 5), round(c[1], 5)],
            },
        })
        r = income.get(p["GEOID"])
        if r:
            est = int(r["median_income"]) if r["median_income"] else None
            moe = int(r["moe"]) if r["moe"] else None
            flag = "suppressed" if est is None else ("high_moe" if r["reliability"] == "low" else "ok")
            rows.append({
                "geoid": p["GEOID"], "acsRelease": "2020–2024 ACS 5-year", "medianIncome": est, "moe": moe,
                "households": int(r["households"] or 0), "flag": flag, "topCoded": r["flag"] == "topcoded_250000plus",
            })

    OUT.write_text(json.dumps({
        "source": f"US Census Bureau: 2020 tracts (cartographic boundary) and ACS {RELEASE} 5-year B19013/B11001",
        "center": CENTER, "radiusMiles": RADIUS_MI,
        "tracts": {"type": "FeatureCollection", "features": features},
        "income": rows,
    }, separators=(",", ":")))
    print(f"{len(features)} tracts, {len(rows)} income rows -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
