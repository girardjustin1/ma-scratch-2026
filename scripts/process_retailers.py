"""Statewide retailer sweep -> data/processed/retailers_ma.csv (+ sweep/proof/retailers parts of
retailers_ma_meta.json). Moved from the one-off process_ma.py (steps 1-3).

1. Dedupe a sweep directory's responses by retailerId (manifest rows with status 200).
2. Census tract per retailer: reuse a saved Census geocoder response when the submitted address
   is unchanged. New or changed addresses are NOT sent anywhere by default: they are marked
   geocode_quality=not_submitted and coord_flag=True, so they are not placed on the map (lower
   confidence, never a guessed tract). Pass --geocode-new to send them to the Census batch
   geocoder (geocoding.geo.census.gov) by hand.
3. Municipality (town polygons), distance to the private pin (data/private/pin.json, never
   printed), and a 1,000,000-point coverage proof of the sweep.
4. Retailers in the previous retailers_ma.csv that the new sweep no longer lists are carried
   forward unchanged, so past claims at stores that have since closed stay matched.

    uv run --with numpy --with shapely python3 scripts/process_retailers.py SWEEP_DIR [--out DIR] [--geocode-new]
"""

from __future__ import annotations

import collections
import csv
import datetime
import io
import json
import re
import sys
import time
import urllib.request
import uuid
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data/processed"
GEO = ROOT / "data/raw/census_geocoder"
UA = "ma-scratch-2026-research/0.1 (personal non-commercial research)"
RE_MI = 3959.0
COMPLETE_RADIUS_MI = 10.0
FLAG_MI = 0.25  # Lottery point vs Census point disagreement that flags a retailer
COLS = ["retailer_id", "locator_id", "name", "address", "address2", "town", "state", "zip", "lat", "lon", "distance_mi",
        "within_complete_radius", "games", "keno_type", "keno_sold", "keno_monitor", "wol_type", "wol_sold",
        "wol_monitor", "self_service", "sells_draw", "ada", "first_seen", "times_seen", "tract_geoid", "census_lat",
        "census_lon", "geocode_quality", "coord_disagreement_mi", "coord_flag", "census_matched_address",
        "municipality", "municipality_source", "best_dist", "covered"]


def hav(la1, lo1, la2, lo2):
    p1, p2 = np.radians(la1), np.radians(la2)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lo2 - lo1) / 2) ** 2
    return 2 * RE_MI * np.arcsin(np.sqrt(h))


def parse_resp(path: Path) -> dict:
    out = {}
    for row in csv.reader(io.StringIO(path.read_text(encoding="utf-8", errors="replace"))):
        if row:
            out[row[0]] = row
    return out


def census_batch(rs: list[dict]) -> dict:
    """Opt-in only (--geocode-new): one Census batch geocoder call, saved raw under data/raw/census_geocoder."""
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rs:
        w.writerow([r["retailer_id"], r["address"], r["town"], r["state"], r["zip"]])
    payload = buf.getvalue().encode()
    ts = datetime.datetime.now(datetime.UTC).strftime("%Y%m%dT%H%M%SZ")
    (GEO / f"{ts}_request.csv").write_bytes(payload)
    b = uuid.uuid4().hex
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
             for k, v in [("benchmark", "Public_AR_Current"), ("vintage", "Current_Current")]]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="addressFile"; filename="addr.csv"\r\n'
                 f"Content-Type: text/csv\r\n\r\n".encode() + payload + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    req = urllib.request.Request("https://geocoding.geo.census.gov/geocoder/geographies/addressbatch",
                                 data=b"".join(parts),
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=1800) as resp:
        body = resp.read()
    path = GEO / f"{ts}_response.csv"
    path.write_bytes(body)
    return parse_resp(path)


def run(sweep_dir: Path, out: Path = P, geocode_new: bool = False) -> dict:
    pin = json.loads((ROOT / "data/private/pin.json").read_text())
    man_all = list(csv.DictReader((sweep_dir / "manifest.csv").open()))
    man = [m for m in man_all if m["status"] == "200"]
    disks = np.array([(float(m["query_lat"]), float(m["query_lon"]), float(m["max_distance_mi"])) for m in man])

    # ---- 1. dedupe
    R = {}
    for m in man:
        ts = m["fetched_at_utc"]
        for x in json.loads((sweep_dir / m["file"]).read_bytes()):
            rid = str(x["retailerId"])
            if rid not in R:
                R[rid] = {"retailer_id": rid, "locator_id": x["id"], "name": x["name"].strip(), "address": x["address"].strip(),
                              "address2": (x.get("address2") or "").strip(), "town": x["city"].strip(), "state": x["state"],
                              "zip": x["zipCode"], "lat": x["latitude"], "lon": x["longitude"], "games": "|".join(x["games"]),
                              "keno_type": x["kenoType"], "keno_sold": x["kenoSoldAtLocation"], "keno_monitor": x["kenoMonitor"],
                              "wol_type": x["wolType"], "wol_sold": x["wolSoldAtLocation"], "wol_monitor": x["wolMonitor"],
                              "self_service": x["selfService"], "sells_draw": x["sellsDrawGame"], "ada": x["adaCompliant"],
                              "first_seen": ts, "times_seen": 0}
            R[rid]["times_seen"] += 1
            R[rid]["first_seen"] = min(R[rid]["first_seen"], ts)
    rows = list(R.values())
    LAT = np.array([r["lat"] for r in rows], float)
    LON = np.array([r["lon"] for r in rows], float)
    dpin = hav(pin["lat"], pin["lon"], LAT, LON)
    covered = np.zeros(len(rows), bool)
    for la, lo, rad in disks:
        covered |= hav(LAT, LON, la, lo) < rad
    for i, r in enumerate(rows):
        r["distance_mi"] = round(float(dpin[i]), 4)
        r["within_complete_radius"] = bool(dpin[i] <= COMPLETE_RADIUS_MI)
        r["covered"] = bool(covered[i])

    # ---- 2. Census geocode: reuse saved responses for unchanged addresses
    prior = {}
    for req_f in sorted(GEO.glob("*_request.csv")):
        resp_f = req_f.with_name(req_f.name.replace("_request.csv", "_response.csv"))
        if not resp_f.exists():
            continue
        res = parse_resp(resp_f)
        for row in csv.reader(req_f.open()):
            if row and row[0] in res:
                prior[row[0]] = (tuple(row[1:5]), res[row[0]])
    G, todo = {}, []
    for r in rows:
        p = prior.get(r["retailer_id"])
        if p and p[0] == (r["address"], r["town"], r["state"], r["zip"]):
            G[r["retailer_id"]] = p[1]
        else:
            todo.append(r)
    submitted = 0
    if todo and geocode_new:
        for i in range(0, len(todo), 5000):
            G.update(census_batch(todo[i:i + 5000]))
            submitted += len(todo[i:i + 5000])
            time.sleep(2)
    for r in rows:
        row = G.get(r["retailer_id"])
        r.update(tract_geoid="", census_lat="", census_lon="", geocode_quality="not_submitted", coord_disagreement_mi="",
                 census_matched_address="")
        if row is None:
            r["coord_flag"] = True
            continue
        st = row[2] if len(row) > 2 else ""
        if st == "Match" and len(row) >= 12 and row[5]:
            lon, lat = map(float, row[5].split(","))
            d = float(hav(r["lat"], r["lon"], lat, lon))
            r.update(census_lat=lat, census_lon=lon, census_matched_address=row[4],
                     geocode_quality="exact" if row[3] == "Exact" else "non_exact",
                     tract_geoid=f"{row[8]}{row[9]}{row[10]}", coord_disagreement_mi=round(d, 4), coord_flag=d > FLAG_MI)
        else:
            r["geocode_quality"] = "tie" if st == "Tie" else "no_match"
            r["coord_flag"] = True

    # ---- 3. municipalities + coverage proof
    towns = json.loads((P / "towns_ma.geojson").read_text())["features"]
    TG = [shape(f["geometry"]) for f in towns]
    TN = [re.sub(r" (Town|City)$", "", f["properties"]["NAME"]) for f in towns]
    tree = shapely.STRtree(TG)

    def muni_of(lats, lons):
        pts = shapely.points(lons, lats)
        pi, ti = tree.query(pts, predicate="within")
        res = np.array([""] * len(lats), dtype=object)
        res[pi] = np.array(TN, dtype=object)[ti]
        return res

    cl = np.array([r["census_lat"] if r["census_lat"] != "" else np.nan for r in rows], float)
    cn = np.array([r["census_lon"] if r["census_lon"] != "" else np.nan for r in rows], float)
    has_c = ~np.isnan(cl)
    mun_c = muni_of(np.where(has_c, cl, 0), np.where(has_c, cn, 0))
    mun_l = muni_of(LAT, LON)
    for i, r in enumerate(rows):
        r["municipality"] = mun_c[i] if has_c[i] else mun_l[i]
        r["municipality_source"] = "census_point" if has_c[i] else "lottery_point_unverified"
        r["best_dist"] = round(float(hav(pin["lat"], pin["lon"], cl[i], cn[i])) if has_c[i] else r["distance_mi"], 4)
        r["in_ma_polygon_lottery_point"] = bool(mun_l[i])

    MA = unary_union(TG)
    shapely.prepare(MA)
    rng = np.random.default_rng(20261110)
    minx, miny, maxx, maxy = MA.bounds
    N = 1_000_000
    px, py = [], []
    while sum(len(a) for a in px) < N:
        x = rng.uniform(minx, maxx, 400_000)
        y = rng.uniform(miny, maxy, 400_000)
        k = shapely.contains_xy(MA, x, y)
        px.append(x[k])
        py.append(y[k])
    PX, PY = np.concatenate(px)[:N], np.concatenate(py)[:N]
    cov_pts = np.zeros(N, bool)
    margin = np.full(N, -1e9)
    for la, lo, rad in disks:
        d = hav(PY, PX, la, lo)
        cov_pts |= d < rad
        np.maximum(margin, rad - d, out=margin)
    pt_town = muni_of(PY, PX)
    unc_by_town = collections.Counter(pt_town[~cov_pts])
    pts_by_town = collections.Counter(pt_town)
    sweep_result = sweep_dir / "sweep_result.json"
    proof = {"random_points": N, "covered_share": round(float(cov_pts.mean()), 6), "min_margin_mi": round(float(margin.min()), 4),
                 "towns_not_fully_covered": {t: {"uncovered_points": c, "points": pts_by_town[t]} for t, c in unc_by_town.most_common()},
                 "grid": json.loads(sweep_result.read_text()) if sweep_result.exists() else None}

    # ---- 4. carry forward retailers the new sweep no longer lists
    seen = {r["retailer_id"] for r in rows}
    prev_path = P / "retailers_ma.csv"
    carried = [r for r in csv.DictReader(prev_path.open()) if r["retailer_id"] not in seen] if prev_path.exists() else []
    out.mkdir(parents=True, exist_ok=True)
    dest = out / "retailers_ma.csv"
    tmp = dest.with_name(dest.name + ".part")
    with tmp.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(rows + carried, key=lambda r: (r["municipality"], r["name"])))
    tmp.replace(dest)

    meta_path = out / "retailers_ma_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.update(
        generated_utc=datetime.datetime.now(datetime.UTC).isoformat(),
        sweep={"dir": sweep_dir.name, "responses": len(man), "new_calls": sum(1 for m in man_all if m["source"] == "new"),
                   "radius_min": float(disks[:, 2].min()), "radius_median": float(np.median(disks[:, 2])),
                   "radius_max": float(disks[:, 2].max())},
        proof=proof,
        retailers={"unique": len(rows), "covered": int(covered.sum()), "carried_forward_not_in_sweep": len(carried),
                       "lottery_point_outside_ma": sum(1 for r in rows if not r["in_ma_polygon_lottery_point"]),
                       "geocode": dict(collections.Counter(r["geocode_quality"] for r in rows)),
                       "census_submitted": submitted,
                       "flagged": sum(bool(r["coord_flag"]) for r in rows),
                       "over_0_25mi": sum(1 for r in rows if r["coord_disagreement_mi"] != "" and r["coord_disagreement_mi"] > 0.25),
                       "over_1mi": sum(1 for r in rows if r["coord_disagreement_mi"] != "" and r["coord_disagreement_mi"] > 1),
                       "median_disagreement_mi": float(np.median([r["coord_disagreement_mi"] for r in rows if r["coord_disagreement_mi"] != ""])),
                       "tracts": len({r["tract_geoid"] for r in rows if r["tract_geoid"] and not r["coord_flag"]}),
                       "municipalities_with_retailer": len({r["municipality"] for r in rows if r["municipality"]})})
    tmp = meta_path.with_name(meta_path.name + ".part")
    tmp.write_text(json.dumps(meta, indent=1, default=str))
    tmp.replace(meta_path)
    return {"retailers": len(rows), "covered": int(covered.sum()), "carried_forward": len(carried),
            "not_geocoded": sum(1 for r in rows if r["geocode_quality"] == "not_submitted"),
            "census_submitted": submitted, "proof_covered_share": proof["covered_share"]}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else P
    sweep_dir = Path(args[0]).resolve()
    print(json.dumps(run(sweep_dir, out, "--geocode-new" in sys.argv)))


if __name__ == "__main__":
    main()
