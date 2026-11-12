"""Game pace: how fast each prize size gets claimed after a game launches, and where each
game on sale sits against games of the same ticket price at the same age.

Descriptive and statewide. Pace says how fast a game's prizes HAVE been claimed. It says
nothing about which store, roll or ticket holds the prizes still left.

    uv run --with duckdb --with pandas python3 scripts/game_pace.py

Reads data/processed/ and writes web/public/local/pace.json (GITIGNORED: built from
Lottery rows). The prototype attaches it to the game picker and the prizes-left panel.

Method
- Printed counts per prize level come from the Lottery's prize tables.
- Claimed-by-week comes from the public winners list, so it starts at each game's launch
  for games launched inside the list window. A listed claim counts toward a prize level
  only when its amount equals that level's value, or 65% of it for annuity prizes taken as
  cash. Combined wins listed as one total are left out.
- Each bucket is validated: listed claims up to each prize-table snapshot vs the table's
  "paid" count. A bucket is used only when the median ratio is within VALID_RATIO.
- Typical pace = 25th–75th percentile of share claimed at week w across games of the same
  price, among games observed through week w. Needs MIN_GAMES games and MIN_PRINTED prizes.
- A game on sale: share claimed now = paid / printed from the current prize table (the
  same numbers as the prizes-left table), at its age in weeks on that table's date.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data/processed"
OUT = ROOT / "web/public/local/pace.json"

CASH_SHARE = 0.65  # annuity prizes taken as cash are listed at 65% of face value
MIN_GAMES = 5  # comparable games needed at a given week for a typical range
MIN_PRINTED = {"top": 2, "b100k": 3, "b10k": 5, "b1k": 10, "b601": 10}
VALID_RATIO = (0.95, 1.05)  # median listed / paid ratio for a bucket to be usable
CHECK_WEEKS = [4, 13, 26, 52]  # weeks reported in the year-by-year stability check
# Same buckets as web/src/domain/prizeBuckets.ts. 'top' is the launch top prize level and
# overlaps the value buckets; a top prize of $600 or less is paid at stores and never listed,
# so it has no pace.
BUCKETS = {
    "top": lambda v, top: top and v > 600,
    "b100k": lambda v, top: v >= 100_000,
    "b10k": lambda v, top: 10_000 <= v < 100_000,
    "b1k": lambda v, top: 1_000 <= v < 10_000,
    "b601": lambda v, top: 600 < v < 1_000,
}


def load(con: duckdb.DuckDBPyConnection):
    games = con.execute(f"""
        SELECT identifier AS id, arg_max(game_id, snapshot_date) AS game_id, arg_max(price, snapshot_date) AS price,
               arg_max(start_date, snapshot_date)::DATE AS launch
        FROM read_parquet('{P / 'games_history.parquet'}') WHERE identifier IS NOT NULL GROUP BY 1""").df()
    # Prize levels: the latest snapshot per game. Printed counts never change.
    hist = con.execute(f"""
        SELECT g.identifier AS id, t.snapshot_date::DATE AS snap, t.tier_value AS v, t.total, t.paid,
               t.is_launch_top_prize AS top, t.is_annuity AS ann
        FROM read_parquet('{P / 'prize_tiers_history.parquet'}') t
        JOIN (SELECT DISTINCT game_id, identifier FROM read_parquet('{P / 'games_history.parquet'}')
              WHERE identifier IS NOT NULL) g USING (game_id)
        -- Some days were captured more than once: keep the latest capture of each level.
        QUALIFY row_number() OVER (PARTITION BY t.game_id, t.snapshot_date, t.tier_number ORDER BY t.capture_timestamp DESC) = 1""").df()
    current = con.execute(f"""
        SELECT identifier AS id, as_of::DATE AS snap, prize_amount AS v, total, paid, tier_type = 'TOP' AS top
        FROM read_parquet('{P / 'prizes_remaining_current.parquet'}')
        QUALIFY row_number() OVER (PARTITION BY identifier, tier_number ORDER BY as_of DESC) = 1""").df()
    claims = con.execute(f"""
        SELECT game_identifier AS id, listed_date::DATE AS d, prize_amount_usd AS v
        FROM read_parquet('{P / 'claims_scratch.parquet'}') WHERE prize_amount_usd > 600""").df()
    span = con.execute(f"SELECT min(listed_date)::DATE, max(listed_date)::DATE FROM read_parquet('{P / 'claims_scratch.parquet'}')").fetchone()
    # One date type everywhere: pandas timestamps at midnight.
    games["launch"] = pd.to_datetime(games["launch"])
    hist["snap"], current["snap"], claims["d"] = pd.to_datetime(hist["snap"]), pd.to_datetime(current["snap"]), pd.to_datetime(claims["d"])
    return games, hist, current, claims, (pd.Timestamp(span[0]), pd.Timestamp(span[1]))


def levels(hist: pd.DataFrame, current: pd.DataFrame) -> pd.DataFrame:
    """One row per game and prize level: value, printed, top flag, annuity flag. Some
    snapshots list only a game's top levels, so levels are pooled across every snapshot
    and the current table (printed counts never change; the largest seen is kept)."""
    per_snap = hist.groupby(["id", "snap", "v"], as_index=False).agg(total=("total", "sum"), top=("top", "max"), ann=("ann", "max"))
    cur = current.groupby(["id", "snap", "v"], as_index=False).agg(total=("total", "sum"), top=("top", "max"))
    cur["ann"] = pd.NA
    allv = pd.concat([per_snap, cur], ignore_index=True)
    lv = allv.groupby(["id", "v"], as_index=False).agg(total=("total", "max"), top=("top", "max"), ann=("ann", "max"))
    lv["top"] = lv["top"].fillna(False).astype(bool)
    lv["ann"] = lv["ann"].fillna(False).astype(bool)
    for b, f in BUCKETS.items():
        lv[b] = [bool(f(v, t)) for v, t in zip(lv["v"], lv["top"])]
    return lv


def match_claims(claims: pd.DataFrame, lv: pd.DataFrame) -> pd.DataFrame:
    """Attach each listed claim to the prize level it pays; drop amounts that match none."""
    face = lv[["id", "v"]].assign(listed=lv["v"])
    cash = lv[lv["ann"]][["id", "v"]].assign(listed=(lv[lv["ann"]]["v"] * CASH_SHARE).round())
    keys = pd.concat([face, cash], ignore_index=True).drop_duplicates(["id", "listed"])
    m = claims.merge(keys, left_on=["id", "v"], right_on=["id", "listed"], suffixes=("_listed", ""))
    return m.drop(columns=["listed", "v_listed"])


def validate(matched: pd.DataFrame, lv: pd.DataFrame, hist: pd.DataFrame, games: pd.DataFrame, start) -> dict:
    """Listed claims through each snapshot vs the prize table's paid count, per bucket,
    for games launched inside the winners-list window."""
    fresh = set(games[games["launch"] >= start]["id"])
    h = hist[hist["id"].isin(fresh)].drop(columns=["top", "ann"]).merge(lv[["id", "v", *BUCKETS]], on=["id", "v"])
    out = {}
    for b in BUCKETS:
        # Compare each snapshot only on the levels it lists.
        hb = h[h[b]].groupby(["id", "snap"]).agg(paid=("paid", "sum"), vs=("v", lambda x: set(x))).reset_index()
        hb = hb[hb["paid"] > 0]
        ratios = []
        for gid, g in hb.groupby("id"):
            mine = matched[matched["id"] == gid]
            for snap, paid, vs in zip(g["snap"], g["paid"], g["vs"]):
                ratios.append(int(((mine["d"] <= snap) & mine["v"].isin(vs)).sum()) / paid)
        s = pd.Series(ratios, dtype=float)
        med = float(s.median()) if len(s) else float("nan")
        out[b] = {"snapshots": len(s), "games": int(hb["id"].nunique()), "median_ratio": round(med, 3),
                  "p10": round(float(s.quantile(0.1)), 3) if len(s) else None,
                  "p90": round(float(s.quantile(0.9)), 3) if len(s) else None,
                  "usable": bool(len(s) >= 20 and VALID_RATIO[0] <= med <= VALID_RATIO[1])}
    return out


def curves(matched: pd.DataFrame, lv: pd.DataFrame, games: pd.DataFrame, start, end) -> pd.DataFrame:
    """Share of each bucket claimed by week since launch, for games launched in the window.
    Rows: id, price, launch, bucket, week, share (cumulative), printed."""
    fresh = games[(games["launch"] >= start) & games["price"].notna()]
    rows = []
    for _, g in fresh.iterrows():
        age = (pd.Timestamp(end) - pd.Timestamp(g["launch"])).days // 7
        if age < 1:
            continue
        mine = matched[matched["id"] == g["id"]]
        weeks = ((pd.to_datetime(mine["d"]) - pd.Timestamp(g["launch"])).dt.days // 7).clip(lower=0)
        for b in BUCKETS:
            lvb = lv[(lv["id"] == g["id"]) & lv[b]]
            printed = int(lvb["total"].sum())
            if printed < MIN_PRINTED[b]:
                continue
            inb = mine["v"].isin(lvb["v"]).to_numpy()
            per_week = pd.Series(weeks[inb]).value_counts().reindex(range(age), fill_value=0).sort_index()
            cum = per_week.cumsum().to_numpy() / printed
            rows += [(g["id"], float(g["price"]), g["launch"], b, w + 1, float(min(cum[w], 1.0)), printed) for w in range(age)]
    return pd.DataFrame(rows, columns=["id", "price", "launch", "bucket", "week", "share", "printed"])


def norms(cv: pd.DataFrame) -> pd.DataFrame:
    """25th/50th/75th percentile share by price, bucket and week (MIN_GAMES or more games)."""
    q = cv.groupby(["price", "bucket", "week"])["share"].describe(percentiles=[0.25, 0.5, 0.75])
    q = q[q["count"] >= MIN_GAMES].reset_index()
    return q.rename(columns={"25%": "p25", "50%": "p50", "75%": "p75", "count": "n"})[["price", "bucket", "week", "p25", "p50", "p75", "n"]]


def stability(cv: pd.DataFrame) -> list[dict]:
    """Median share at CHECK_WEEKS by launch-year cohort, per price and bucket."""
    cv = cv.assign(cohort=pd.to_datetime(cv["launch"]).dt.year)
    out = []
    for (price, b), g in cv.groupby(["price", "bucket"]):
        row = {"price": price, "bucket": b}
        for w in CHECK_WEEKS:
            gw = g[g["week"] == w]
            row[f"w{w}"] = {str(y): {"median": round(float(x["share"].median()), 3), "n": len(x)}
                            for y, x in gw.groupby("cohort") if len(x) >= 3}
        out.append(row)
    return out


def pace_now(current: pd.DataFrame, lv: pd.DataFrame, games: pd.DataFrame, nm: pd.DataFrame, cv: pd.DataFrame, usable: set) -> dict:
    """Each game in the current prize table: age, share claimed per bucket, and the call."""
    cur = current.drop(columns=["top"]).merge(lv[["id", "v", *BUCKETS]].drop_duplicates(["id", "v"]), on=["id", "v"], how="left")
    meta = games.set_index("id")
    nmi = nm.set_index(["price", "bucket", "week"])
    comparable = {k: g.set_index("id")["share"] for k, g in cv.groupby(["price", "bucket", "week"])}
    out = {}
    for gid, g in cur.groupby("id"):
        if gid not in meta.index or pd.isna(meta.at[gid, "launch"]) or pd.isna(meta.at[gid, "price"]):
            continue
        price, launch = float(meta.at[gid, "price"]), meta.at[gid, "launch"]
        as_of = g["snap"].max()
        age = int((pd.Timestamp(as_of) - pd.Timestamp(launch)).days // 7)
        by = {}
        for b in BUCKETS:
            gb = g[g[b].fillna(False).astype(bool)]
            printed, paid = int(gb["total"].sum()), int(gb["paid"].sum())
            if printed == 0:
                continue
            entry = {"printed": printed, "claimed": paid, "share": round(paid / printed, 4)}
            key = (price, b, age)
            if b not in usable:
                entry["call"] = "unchecked"
            elif printed < MIN_PRINTED[b]:
                entry["call"] = "too_few"
            elif key not in nmi.index:
                entry["call"] = "no_norm"
            else:
                r = nmi.loc[key]
                entry |= {"p25": round(float(r["p25"]), 4), "p50": round(float(r["p50"]), 4), "p75": round(float(r["p75"]), 4),
                          "n": int(r["n"])}
                # Percentile rank among comparable games at this age, leaving this game out
                # and splitting ties evenly: shares come in steps when few prizes are printed,
                # so comparing with interpolated quartiles would call ties 'behind'.
                peers = comparable.get(key)
                peers = peers[peers.index != gid] if peers is not None else None
                if peers is None or len(peers) < MIN_GAMES:
                    entry["call"] = "no_norm"
                else:
                    sh = entry["share"]
                    rank = ((peers < sh - 1e-9).sum() + 0.5 * (abs(peers - sh) <= 1e-9).sum()) / len(peers)
                    entry["rank"] = round(float(rank), 3)
                    entry["call"] = "ahead" if rank > 0.75 else "behind" if rank < 0.25 else "on_pace"
            # The game's own weekly curve, when it launched inside the winners-list window.
            mine = cv[(cv["id"] == gid) & (cv["bucket"] == b)].sort_values("week")
            if len(mine):
                entry["curve"] = [round(x, 4) for x in mine["share"]]
            by[b] = entry
        out[gid] = {"price": price, "launch": str(launch.date()), "asOf": str(as_of.date()), "ageWeeks": age, "buckets": by}
    return out


def market(matched: pd.DataFrame, lv: pd.DataFrame, end, usable: set) -> dict:
    """Statewide context per bucket: listed claims in the last 13 weeks vs the same 13
    weeks a year earlier. Pace compares a game with earlier games at the same age, so a
    statewide slowdown shows up as games running 'behind'."""
    to = pd.Timestamp(end)
    frm = to - pd.Timedelta(days=13 * 7 - 1)
    out = {"from": str(frm.date()), "to": str(to.date()),
           "priorFrom": str((frm - pd.Timedelta(days=364)).date()), "priorTo": str((to - pd.Timedelta(days=364)).date())}
    for b in sorted(usable):
        vs = lv[lv[b]][["id", "v"]]
        mb = matched.merge(vs, on=["id", "v"])
        now = int(((mb["d"] >= frm) & (mb["d"] <= to)).sum())
        prior = int(((mb["d"] >= frm - pd.Timedelta(days=364)) & (mb["d"] <= to - pd.Timedelta(days=364))).sum())
        out[b] = {"recent": now, "prior": prior, "change": round(now / prior - 1, 3) if prior else None}
    return out


def main() -> None:
    con = duckdb.connect()
    games, hist, current, claims, (start, end) = load(con)
    lv = levels(hist, current)
    matched = match_claims(claims, lv)
    val = validate(matched, lv, hist, games, start)
    usable = {b for b, v in val.items() if v["usable"]}
    cv = curves(matched, lv, games, start, end)
    cv = cv[cv["bucket"].isin(usable)]
    nm = norms(cv)
    st = stability(cv)
    now = pace_now(current, lv, games, nm, cv, usable)

    norms_out: dict = {}
    for (price, b), g in nm.groupby(["price", "bucket"]):
        norms_out.setdefault(str(int(price)), {})[b] = [
            [int(w), round(float(p25), 4), round(float(p50), 4), round(float(p75), 4), int(n)]
            for w, p25, p50, p75, n in g[["week", "p25", "p50", "p75", "n"]].itertuples(index=False)]
    out = {
        "note": "LOCAL ONLY. Built from Mass Lottery data: personal, non-commercial use; do not redistribute.",
        "claimsFrom": str(start.date()), "claimsTo": str(end.date()),
        "method": {"cashShare": CASH_SHARE, "minGames": MIN_GAMES, "minPrinted": MIN_PRINTED},
        "validation": val, "usableBuckets": sorted(usable),
        "gamesInNorms": int(cv["id"].nunique()),
        "norms": norms_out,  # price -> bucket -> [week, p25, p50, p75, n]
        "stability": st,
        "market": market(matched, lv, end, usable),
        "games": now,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out))

    print(f"claims {start.date()} – {end.date()} · {len(matched):,} of {len(claims):,} listed claims matched a prize level")
    print("validation (listed ÷ paid):")
    for b, v in val.items():
        print(f"  {b:<6} {v['games']:>3} games {v['snapshots']:>5} snapshots  median {v['median_ratio']}  p10–p90 {v['p10']}–{v['p90']}  {'OK' if v['usable'] else 'NOT USED'}")
    print(f"games in norms: {out['gamesInNorms']}  ·  norm cells: {len(nm):,}")
    calls = pd.Series([e["call"] for g in now.values() for e in g["buckets"].values()]).value_counts()
    print("calls:", calls.to_dict())
    print("stability, $10k–$99,999, median share claimed by launch year:")
    for r in st:
        if r["bucket"] == "b10k":
            print(f"  ${int(r['price']):<3}", "  ".join(f"w{w}: " + ", ".join(f"{y} {d['median']:.0%} (n{d['n']})" for y, d in r[f'w{w}'].items()) for w in CHECK_WEEKS))
    print("statewide, last 13 weeks vs a year earlier:", {b: v for b, v in out["market"].items() if isinstance(v, dict)})
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
