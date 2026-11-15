"""Raw winners days -> processed claims, matched to statewide retailers.

Moved from the one-off build_parquet.py + process_ma.py (steps 4-6). Reads only local files:

- data/raw/lottery_winners/daily/*.json
  -> data/processed/claims_all.parquet, claims_scratch.parquet, claims_per_day.csv
- data/processed/retailers_ma.csv (from scripts/process_retailers.py), towns_ma.geojson
  -> location_municipality_map.csv, retailer_matches_ma.csv, unresolved_retailer_matches.csv,
     claims_tract_ma.parquet, and the claims/locations part of retailers_ma_meta.json

Matching tiers (unchanged): exact normalised name + town (high); brand + store number + town
and name without store number + town (medium); unique same name in the municipality (low).
Ambiguous or missing matches are written to unresolved_retailer_matches.csv, never guessed.

    uv run --with duckdb --with pyarrow python3 scripts/process_winners.py [--out DIR]
"""

from __future__ import annotations

import collections
import csv
import datetime as dt
import difflib
import json
import re
import sys
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
DAILY = ROOT / "data/raw/lottery_winners/daily"
P = ROOT / "data/processed"
DRAW = {"keno", "lucky_for_life", "mass_3", "mass_4", "mass_cash", "mega_millions", "megabucks",
        "millionaire_for_life", "the_numbers_game", "powerball"}
CLAIM_SCHEMA = pa.schema([("listed_date", pa.date32()), ("game_identifier", pa.string()), ("game_name", pa.string()),
                          ("prize_amount_usd", pa.int64()), ("prize_amount_display", pa.string()),
                          ("retailer", pa.string()), ("retailer_location", pa.string()), ("is_online", pa.bool_()),
                          ("is_draw_game", pa.bool_()), ("source_day_file", pa.string())])


# ---------------------------------------------------------------- 1. claims parquet
def build_claims(out: Path) -> dict:
    recs, bad = [], 0
    files = sorted(DAILY.glob("*.json"))
    for fn in files:
        day = fn.stem
        for r in json.loads(fn.read_bytes())["pageOfWinners"]:
            if r["date_of_win"] != day:
                bad += 1
            loc = r.get("retailer_location")
            recs.append({"listed_date": dt.date.fromisoformat(r["date_of_win"]), "game_identifier": r["identifier"],
                         "game_name": r["name"], "prize_amount_usd": r["prize_amount_usd"],
                         "prize_amount_display": r["prize_amount_display"], "retailer": r.get("retailer"),
                         "retailer_location": loc, "is_online": loc == "Online",
                         "is_draw_game": r["identifier"] in DRAW, "source_day_file": f"daily/{day}.json"})
    t = pa.Table.from_pylist(recs, schema=CLAIM_SCHEMA)
    scratch = t.filter(pc.and_(pc.invert(t["is_draw_game"]), pc.invert(t["is_online"])))
    _write_parquet(t, out / "claims_all.parquet")
    _write_parquet(scratch, out / "claims_scratch.parquet")

    # per-day counts over every day from the first to the last saved file
    first, last = dt.date.fromisoformat(files[0].stem), dt.date.fromisoformat(files[-1].stem)
    n_all = collections.Counter(r["listed_date"] for r in recs)
    n_scr = collections.Counter(r["listed_date"] for r in recs if not r["is_draw_game"] and not r["is_online"])
    with _atomic(out / "claims_per_day.csv") as f:
        w = csv.writer(f)
        w.writerow(["listed_date", "all", "scratch", "wd"])
        d = first
        while d <= last:
            w.writerow([d.isoformat(), n_all[d], n_scr[d], d.strftime("%a")])
            d += dt.timedelta(days=1)
    return {"days": len(files), "first": first.isoformat(), "last": last.isoformat(), "all_rows": t.num_rows,
            "scratch_rows": scratch.num_rows, "date_mismatch_rows": bad}


def _write_parquet(t: pa.Table, path: Path) -> None:
    tmp = path.with_name(path.name + ".part")
    pq.write_table(t, tmp)
    tmp.replace(path)


class _atomic:
    """Text file written to .part and renamed into place on success."""

    def __init__(self, path: Path):
        self.path, self.tmp = path, path.with_name(path.name + ".part")

    def __enter__(self):
        self.f = self.tmp.open("w", newline="")
        return self.f

    def __exit__(self, exc_type, *_):
        self.f.close()
        if exc_type is None:
            self.tmp.replace(self.path)
        else:
            self.tmp.unlink(missing_ok=True)


# ---------------------------------------------------------------- 2. retailers + municipalities
def load_retailers(path: Path) -> list[dict]:
    rows = list(csv.DictReader(path.open()))
    for r in rows:
        r["coord_flag"] = r["coord_flag"] == "True"
        r["census_lat"] = float(r["census_lat"]) if r["census_lat"] not in ("", None) else ""
    return rows


def town_names() -> list[str]:
    towns = json.loads((P / "towns_ma.geojson").read_text())["features"]
    return [re.sub(r" (Town|City)$", "", f["properties"]["NAME"]) for f in towns]


MUNI_NAMES: dict[str, str] = {}
BOSTON_HOODS = {"BOSTON", "E BOSTON", "EAST BOSTON", "S BOSTON", "SOUTH BOSTON", "DORCHESTER", "DORCHESTER CENTER",
                "ROXBURY", "ROXBURY CROSSING", "JAMAICA PLAIN", "CHARLESTOWN", "BRIGHTON", "ALLSTON", "HYDE PARK",
                "ROSLINDALE", "MATTAPAN", "W ROXBURY", "WEST ROXBURY", "READVILLE", "MISSION HILL", "BACK BAY",
                "N DORCHESTER"}
DIR = {"N": "NORTH", "S": "SOUTH", "E": "EAST", "W": "WEST"}
ALIAS = {"MANCHESTER BY THE SE": "MANCHESTER BY THE SEA", "MANCHESTER": "MANCHESTER BY THE SEA",
         "GT BARRINGTON": "GREAT BARRINGTON"}
MANUAL = {"BRANT ROCK": "Marshfield", "MANOMET": "Plymouth", "WHITE HORSE BCH": "Plymouth", "MANCHAUG": "Sutton",
          "SHELDONVILLE": "Wrentham", "NORTHHAMPTON": "Northampton", "SOUTH EASTON": "Easton"}
MANUAL_AMBIG = {"DEVENS": "Ayer/Harvard/Shirley", "BONDSVILLE": "Palmer/Belchertown"}


def ntown(s):
    return re.sub(r"[^A-Z0-9]+", " ", (s or "").upper()).strip()


def make_map_loc(ev):
    def map_loc(loc):
        t = ALIAS.get(ntown(loc), ntown(loc))
        if t in BOSTON_HOODS:
            return "Boston", "boston_neighbourhood_list"
        if t in MUNI_NAMES:
            return MUNI_NAMES[t], "same_name"
        t2 = re.sub(r"BORO$", "BOROUGH", t)
        if t2 != t and t2 in MUNI_NAMES:
            return MUNI_NAMES[t2], "boro_spelling"
        toks = t.split()
        if toks and toks[0] in DIR:
            full = " ".join([DIR[toks[0]]] + toks[1:])
            if full in MUNI_NAMES:
                return MUNI_NAMES[full], "direction_expanded"
        c = ev.get(t)
        if c:
            top, n = c.most_common(1)[0]
            tot = sum(c.values())
            if n / tot >= 0.8:
                return top, f"retailer_evidence_{n}_of_{tot}"
            return "AMBIGUOUS", "retailer_evidence_split:" + ";".join(f"{k}={v}" for k, v in c.most_common())
        if toks and toks[0] in DIR and " ".join(toks[1:]) in MUNI_NAMES:
            return MUNI_NAMES[" ".join(toks[1:])], "direction_stripped"
        if t in MANUAL:
            return MANUAL[t], "manual_village"
        if t in MANUAL_AMBIG:
            return "AMBIGUOUS", "manual_village_spans:" + MANUAL_AMBIG[t]
        return "", "unmapped"
    return map_loc


# ---------------------------------------------------------------- 3. matching
SUFFIX = {"INC", "LLC", "CORP", "CORPORATION", "CO", "LTD", "THE"}
CONF = {"exact_norm_name_town": "high", "brand_store_number_town": "medium", "name_no_store_number_town": "medium",
        "name_municipality": "low"}


def norm(s):
    s = (s or "").upper().replace("&", " AND ").replace("'", "")
    s = re.sub(r"#\s*\d+[A-Z]?", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return " ".join(t for t in s.split() if t not in SUFFIX)


def norm_nonum(s):
    toks = norm(s).split()
    out = [t for t in toks if not re.fullmatch(r"\d{2,}[A-Z]?|[A-Z]?\d{3,}", t)]
    while len(out) > 1 and len(out[-1]) == 1 and len(out) < len(toks):
        out.pop()
    return " ".join(out)


def nums(s):
    u = (s or "").upper()
    out = {re.sub(r"[A-Z]$", "", t) for t in re.findall(r"\d{3,}[A-Z]?", u)} | set(re.findall(r"#\s*(\d{2,})", u))
    return {t.lstrip("0") or "0" for t in out}


def brand(s):
    return (norm_nonum(s).split() or [""])[0]


def match_claims(out: Path, retailers_csv: Path) -> dict:
    MUNI_NAMES.clear()
    MUNI_NAMES.update({re.sub(r"[^A-Z0-9]+", " ", n.upper()).strip(): n for n in town_names()})
    rows = load_retailers(retailers_csv)
    ev = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["census_lat"] != "" and not r["coord_flag"] and r["municipality"]:
            ev[ntown(r["town"])][r["municipality"]] += 1
    map_loc = make_map_loc(ev)

    con = duckdb.connect()
    pqf = out / "claims_scratch.parquet"
    locs = con.sql(f"select retailer_location, count(*) from '{pqf}' group by 1").fetchall()
    locmap = {loc: (*map_loc(loc), n) for loc, n in locs}
    for r in rows:
        r["town_municipality"] = map_loc(r["town"])[0]
        if r["town"] not in locmap:
            locmap[r["town"]] = (*map_loc(r["town"]), 0)
    with _atomic(out / "location_municipality_map.csv") as f:
        w = csv.writer(f)
        w.writerow(["location", "municipality", "method", "claims", "source"])
        for loc, (m, how, n) in sorted(locmap.items(), key=lambda kv: (kv[1][0], kv[0] or "")):
            w.writerow([loc, m, how, n, "claims" if n else "locator_only"])
    xcheck = collections.Counter(
        "agree" if r["town_municipality"] == r["municipality"] else "disagree"
        for r in rows if r["census_lat"] != "" and not r["coord_flag"] and r["town_municipality"] not in ("", "AMBIGUOUS"))

    idx1, idx2, by_town, by_muni_name, by_muni = (collections.defaultdict(list) for _ in range(5))
    for r in rows:
        t = ntown(r["town"])
        idx1[(norm(r["name"]), t)].append(r)
        idx2[(norm_nonum(r["name"]), t)].append(r)
        by_town[t].append(r)
        if r["municipality"]:
            by_muni_name[(norm(r["name"]), r["municipality"])].append(r)
            by_muni[r["municipality"]].append(r)

    def match(name, loc):
        t = ntown(loc)
        muni = locmap.get(loc, ("", "", 0))[0]
        wn = nums(name)
        c1 = idx1.get((norm(name), t), [])
        c1n = [r for r in c1 if nums(r["name"]) & wn] if (len(c1) > 1 and wn) else []
        if len(c1) == 1 and wn and nums(c1[0]["name"]) and not (nums(c1[0]["name"]) & wn):
            return "no_match_store_number_differs", c1
        if len(c1) == 1:
            return "exact_norm_name_town", c1
        if len(c1n) == 1:
            return "brand_store_number_town", c1n
        if len(c1) > 1:
            return "ambiguous", c1
        c15 = [r for r in by_town[t] if wn and (nums(r["name"]) & wn) and brand(r["name"]) == brand(name)] if wn else []
        c2 = idx2.get((norm_nonum(name), t), [])
        if len(c15) == 1:
            return "brand_store_number_town", c15
        if len(c15) > 1:
            return "ambiguous", c15
        if wn and c2 and not any(nums(r["name"]) & wn for r in c2) and all(nums(r["name"]) for r in c2):
            return "no_match_store_number_differs", c2
        if len(c2) == 1:
            return "name_no_store_number_town", c2
        if len(c2) > 1:
            return "ambiguous", c2
        if muni and muni != "AMBIGUOUS":
            cm_all = by_muni_name.get((norm(name), muni), [])
            # outside Boston a unique same-name store in the municipality is accepted (low confidence);
            # inside Boston only when the retailer's own postal town does not roll up cleanly
            cm = cm_all if muni != "Boston" else [r for r in cm_all if r["town_municipality"] in ("", "AMBIGUOUS")]
            if len(cm) == 1 and not (wn and nums(cm[0]["name"]) and not (nums(cm[0]["name"]) & wn)):
                return "name_municipality", cm
            if len(cm) > 1:
                return "ambiguous", cm
            if cm_all:
                return "no_match_other_neighbourhood", cm_all
        pool = by_town[t] or (by_muni[muni] if muni and muni != "AMBIGUOUS" else [])
        names = {}
        for r in pool:
            names.setdefault(norm(r["name"]), r)
        close = difflib.get_close_matches(norm(name), list(names), n=3, cutoff=0.75)
        return ("no_match_fuzzy_candidates" if close else "no_candidate"), [names[c] for c in close]

    pairs = con.sql(f"select retailer, retailer_location, count(*), min(listed_date), max(listed_date) from '{pqf}' "
                    "where retailer is not null group by 1,2 order by 1,2").fetchall()
    mrows, unresolved = [], []
    for name, loc, n, d0, d1 in pairs:
        method, cand = match(name, loc)
        muni = locmap.get(loc, ("", "", 0))[0]
        base = {"winner_retailer": name, "winner_location": loc, "municipality": muni, "claims": n, "first_listed": d0,
                    "last_listed": d1, "method": method}
        if method in CONF:
            c = cand[0]
            mrows.append(dict(base, retailer_id=c["retailer_id"], retailer_name=c["name"], retailer_town=c["town"],
                              retailer_municipality=c["municipality"], match_confidence=CONF[method],
                              retailer_flagged=bool(c["coord_flag"]), tract_geoid="" if c["coord_flag"] else c["tract_geoid"]))
        else:
            unresolved.append(dict(base, candidates=" || ".join(
                f"{c['retailer_id']}:{c['name']} @ {c['address']}, {c['town']}" for c in cand)))
    with _atomic(out / "unresolved_retailer_matches.csv") as f:
        w = csv.DictWriter(f, fieldnames=list(unresolved[0]))
        w.writeheader()
        w.writerows(unresolved)
    with _atomic(out / "retailer_matches_ma.csv") as f:
        w = csv.DictWriter(f, fieldnames=list(mrows[0]))
        w.writeheader()
        w.writerows(mrows)

    con.execute("create temp table pm (retailer varchar, retailer_location varchar, municipality varchar, method varchar, "
                "matched boolean, retailer_id bigint, match_confidence varchar, tract_geoid varchar, flagged boolean, "
                "retailer_municipality varchar)")
    con.executemany("insert into pm values (?,?,?,?,?,?,?,?,?,?)",
                    [(x["winner_retailer"], x["winner_location"], x["municipality"], x["method"], True,
                      int(x["retailer_id"]), x["match_confidence"], x["tract_geoid"] or None, x["retailer_flagged"],
                      x["retailer_municipality"]) for x in mrows]
                    + [(x["winner_retailer"], x["winner_location"], x["municipality"], x["method"], False, None, None,
                        None, None, None) for x in unresolved])
    tract_out = out / "claims_tract_ma.parquet"
    tmp = tract_out.with_name(tract_out.name + ".part")
    con.execute(f"""copy (select c.listed_date, c.game_identifier, c.game_name, c.prize_amount_usd, p.retailer_id,
        p.method as match_method, p.match_confidence, p.tract_geoid,
        case when p.municipality in ('', 'AMBIGUOUS') then p.retailer_municipality else p.municipality end as municipality
        from '{pqf}' c join pm p on c.retailer = p.retailer and c.retailer_location = p.retailer_location
        where p.matched order by c.listed_date) to '{tmp}' (format parquet)""")
    tmp.replace(tract_out)

    # ---- stats into retailers_ma_meta.json (claims part only; sweep/proof/retailers parts are kept)
    J = f"from '{pqf}' c left join pm p on c.retailer = p.retailer and c.retailer_location = p.retailer_location"
    by_year = con.sql(f"""select year(c.listed_date) y, count(*) total, count(c.retailer) with_name,
        sum(coalesce(p.matched,false)::int) matched, count(p.tract_geoid) in_tract,
        sum((coalesce(p.matched,false) and p.flagged)::int) flagged_dropped {J} group by 1 order by 1""").fetchall()
    tot = con.sql(f"""select count(*), count(c.retailer), sum(coalesce(p.matched,false)::int), count(p.tract_geoid),
        sum((coalesce(p.matched,false) and p.flagged)::int), sum((not coalesce(p.matched,true))::int) {J}""").fetchall()[0]
    lowest = con.sql(f"""select p.municipality, count(*) n, sum(p.matched::int) m, round(100.0*sum(p.matched::int)/count(*),1) pct
        {J} where c.retailer is not null and p.municipality not in ('', 'AMBIGUOUS') group by 1 having count(*) >= 300
        order by pct asc limit 10""").fetchall()
    methods = con.sql(f"select p.method, count(*) {J} where c.retailer is not null group by 1 order by 2 desc").fetchall()
    unres_reason, unres_claims = collections.Counter(), collections.Counter()
    for u in unresolved:
        unres_reason[u["method"]] += 1
        unres_claims[u["method"]] += u["claims"]
    pqs = con.sql(f"select count(*), count(tract_geoid), count(distinct retailer_id), count(distinct municipality), "
                  f"min(listed_date), max(listed_date) from '{tract_out}'").fetchall()[0]
    meta_path = out / "retailers_ma_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.update(
        claims_generated_utc=dt.datetime.now(dt.UTC).isoformat(),
        locations={"total": len(locs), "by_method": dict(collections.Counter(
            re.sub(r"_\d+_of_\d+|:.*", "", v[1]) for k, v in locmap.items() if v[2] > 0)),
            "unmapped": [(k, v[2]) for k, v in locmap.items() if v[0] == "" and v[2] > 0],
            "ambiguous": [(k, v[1], v[2]) for k, v in locmap.items() if v[0] == "AMBIGUOUS" and v[2] > 0]},
        municipality_xcheck=dict(xcheck),
        claims={"total": tot[0], "with_retailer_name": tot[1], "matched": tot[2], "in_verified_tract": tot[3],
                    "matched_flagged_dropped": tot[4], "unresolved_claims": tot[5], "unresolved_pairs": len(unresolved),
                    "matched_pairs": len(mrows), "unresolved_by_reason_pairs": dict(unres_reason),
                    "unresolved_by_reason_claims": dict(unres_claims),
                    "by_year": [{"year": y, "total": t, "with_name": wn, "matched": m, "in_tract": it, "flagged_dropped": fd,
                                  "matched_pct": round(100 * m / t, 1), "in_tract_pct": round(100 * it / t, 1)}
                             for y, t, wn, m, it, fd in by_year],
                    "by_method": dict(methods),
                    "lowest_10_municipalities_min300": [{"municipality": a, "claims": n, "matched": m, "pct": p} for a, n, m, p in lowest]},
        parquet={"rows": pqs[0], "with_tract": pqs[1], "retailers": pqs[2], "municipalities": pqs[3]})
    with _atomic(meta_path) as f:
        json.dump(meta, f, indent=1, default=str)
    return {"scratch_claims": tot[0], "matched": tot[2], "in_tract": tot[3], "unresolved_pairs": len(unresolved),
            "tract_rows": pqs[0], "tract_last": str(pqs[5])}


def run(out: Path = P) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    claims = build_claims(out)
    matched = match_claims(out, P / "retailers_ma.csv")
    return {**claims, **matched}


def main() -> None:
    out = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else P
    print(json.dumps(run(out), default=str))


if __name__ == "__main__":
    main()
