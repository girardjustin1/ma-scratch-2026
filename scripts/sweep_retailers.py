"""Fresh statewide sweep of the Lottery's retailer locator (/api/v2/retailers/nearby, which
returns the 100 nearest retailers), moved from the one-off sweep_ma.py.

Writes a NEW directory data/raw/lottery_retailers/sweep_statewide_<YYYYMMDD>/ with one raw
JSON per call, manifest.csv and, once the state is covered, sweep_result.json. Earlier sweeps
are never touched. Resumable: re-reads its own manifest.

Domain: union of data/processed/towns_ma.geojson buffered ~0.3 mi. Grid check points S mi
apart; a point is covered when its distance to a call's centre <= that call's farthest
retailer - EPS, EPS = S/sqrt2 + 0.01. Calls grow outward from the state's centre, each placed
to cover as many uncovered points as possible. Hard cap MAX_NEW calls, 1.3 s apart.

    uv run --with numpy --with shapely python3 scripts/sweep_retailers.py [SWEEP_DIR]
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import shapely
from lottery_http import FetchError, get, save_new
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/raw/lottery_retailers"
URL = ("https://www.masslottery.com/api/v2/retailers/nearby?latitude={lat:.6f}&longitude={lon:.6f}"
       "&userLatitude={lat:.6f}&userLongitude={lon:.6f}")
RE_MI = 3959.0
S = 0.2
EPS = S / math.sqrt(2) + 0.01
MAX_NEW = 900
FIELDS = ["call", "source", "file", "query_lat", "query_lon", "fetched_at_utc", "status", "n", "max_distance_mi", "sha256"]


def hav(la1, lo1, la2, lo2):
    p1, p2 = np.radians(la1), np.radians(la2)
    h = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lo2 - lo1) / 2) ** 2
    return 2 * RE_MI * np.arcsin(np.sqrt(h))


def sweep_dirs() -> list[Path]:
    return sorted(p for p in BASE.glob("sweep_statewide*") if (p / "manifest.csv").exists())


def last_complete_sweep() -> tuple[Path | None, datetime.datetime | None]:
    """Newest sweep directory with a sweep_result.json showing 0 uncovered grid points, and the
    time of its last call (UTC)."""
    best = (None, None)
    for d in sweep_dirs():
        res = d / "sweep_result.json"
        if not res.exists() or json.loads(res.read_text()).get("grid_uncovered") != 0:
            continue
        ts = max(m["fetched_at_utc"] for m in csv.DictReader((d / "manifest.csv").open()))
        t = datetime.datetime.strptime(ts[:15], "%Y%m%dT%H%M%S").replace(tzinfo=datetime.UTC)
        if best[1] is None or t > best[1]:
            best = (d, t)
    return best


def incomplete_sweep() -> Path | None:
    for d in reversed(sweep_dirs()):
        if not (d / "sweep_result.json").exists():
            return d
    return None


def sweep(out: Path, max_new: int = MAX_NEW) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    man = out / "manifest.csv"

    def write_row(row):
        new = not man.exists()
        with man.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            w.writerow(row)

    disks, new_calls = [], 0
    if man.exists():
        for m in csv.DictReader(man.open()):
            if m["status"] == "200":
                disks.append((float(m["query_lat"]), float(m["query_lon"]), float(m["max_distance_mi"])))
            new_calls += 1

    towns = json.loads((ROOT / "data/processed/towns_ma.geojson").read_text())["features"]
    MA = unary_union([shape(f["geometry"]) for f in towns])
    lat0 = 42.1
    KX = math.cos(math.radians(lat0)) * 2 * math.pi * RE_MI / 360
    KY = 2 * math.pi * RE_MI / 360
    MAb = MA.buffer(0.3 / KY)
    minx, miny, maxx, maxy = MAb.bounds
    xs = np.arange(minx, maxx + 1e-9, S / KX)
    ys = np.arange(miny, maxy + 1e-9, S / KY)
    GX, GY = np.meshgrid(xs, ys)
    GX, GY = GX.ravel(), GY.ravel()
    shapely.prepare(MAb)
    keep = shapely.contains_xy(MAb, GX, GY)
    PLON, PLAT = GX[keep], GY[keep]
    cov = np.zeros(len(PLON), bool)
    for la, lo, r in disks:
        cov |= hav(PLAT, PLON, la, lo) <= r - EPS
    centre = MA.representative_point()
    dist_c = hav(PLAT, PLON, centre.y, centre.x)

    def fetch(lat, lon):
        nonlocal new_calls
        url = URL.format(lat=lat, lon=lon)
        ts = datetime.datetime.now(datetime.UTC).strftime("%Y%m%dT%H%M%S.%fZ")
        status, body, _ = get(url)
        new_calls += 1
        fn = f"{ts}_s{new_calls:03d}.json"
        save_new(out / fn, body)
        n, md = 0, ""
        if status == 200:
            L = json.loads(body)
            n = len(L)
            md = max(x["distance"] for x in L) if L else 0.0
        write_row({"call": f"S{new_calls:03d}", "source": "new", "file": fn, "query_lat": f"{lat:.6f}", "query_lon": f"{lon:.6f}",
                       "fetched_at_utc": ts, "status": status, "n": n, "max_distance_mi": md, "sha256": hashlib.sha256(body).hexdigest()})
        if status != 200:
            raise FetchError(f"retailer sweep call {new_calls}: HTTP {status}; stopped (resumable)")
        disks.append((lat, lon, float(md)))

    while True:
        unc = ~cov
        if not unc.any():
            break
        if new_calls >= max_new:
            raise FetchError(f"retailer sweep hit the {max_new}-call cap with {int(unc.sum())} grid points uncovered")
        ui = np.flatnonzero(unc)
        i = ui[np.argmin(dist_c[ui])]
        ula, ulo = PLAT[i], PLON[i]
        best = (ula, ulo)
        if disks:  # place the call to cover the most uncovered points, sized by the nearest earlier call
            r_est = disks[int(np.argmin([float(hav(ula, ulo, la, lo)) for la, lo, _ in disks]))][2]
            ULAT, ULON = PLAT[ui], PLON[ui]
            bs = -1
            for k in (0.0, 0.35, 0.6):
                for a in range(0, 360, 30):
                    cla = ula + k * r_est * math.sin(math.radians(a)) / KY
                    clo = ulo + k * r_est * math.cos(math.radians(a)) / KX
                    sc = int((hav(ULAT, ULON, cla, clo) <= 0.9 * r_est - EPS).sum())
                    if sc > bs:
                        best, bs = (cla, clo), sc
                    if k == 0:
                        break
        fetch(*best)
        la, lo, r = disks[-1]
        cov |= hav(PLAT, PLON, la, lo) <= r - EPS
        if new_calls % 25 == 0:
            print(f"  sweep: {new_calls} calls, {int((~cov).sum())} grid points uncovered", flush=True)

    result = {"new_calls": new_calls, "reused": 0, "grid_points": len(PLON), "grid_uncovered": int((~cov).sum()),
                  "grid_spacing_mi": S, "eps_mi": EPS}
    save_new(out / "sweep_result.json", json.dumps(result, indent=1).encode())
    return result


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        incomplete_sweep() or BASE / f"sweep_statewide_{datetime.date.today():%Y%m%d}")
    print(out.name, sweep(out))


if __name__ == "__main__":
    main()
