"""Steps 3-4: parse raw Wayback captures into prize_tiers_history, games_history, ev_history.

Run: uv run --with polars python parse.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "wayback"
LIVE = ROOT / "data" / "raw" / "lottery_games"
OUT = ROOT / "data" / "processed"

MONEY = re.compile(r"\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KkMm])?")
ANNUITY = re.compile(r"/\s*(YR|YRS|WK|WEEK|MO|MONTH|LF|LIFE)\b|A\s+YEAR|FOR\s+LIFE|PER\s+(YEAR|WEEK)", re.I)
PRINTED = re.compile(r"sale\s+of\s+(?:approximately\s+)?([0-9][0-9,]+)\s+tickets", re.I)


def manifest() -> dict[str, dict]:
    out = {}
    for line in (RAW / "manifest.jsonl").read_text().splitlines():
        r = json.loads(line)
        out[r["file"]] = r
    return out


def advertised(desc: str | None) -> float | None:
    if not desc:
        return None
    m = MONEY.search(desc)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    mult = {"k": 1e3, "m": 1e6}.get((m.group(2) or "").lower(), 1)
    return v * mult


def rich_text(node) -> str:
    if isinstance(node, dict):
        s = node.get("value", "") if isinstance(node.get("value"), str) else ""
        return s + " ".join(rich_text(c) for c in node.get("content", []) or [])
    if isinstance(node, list):
        return " ".join(rich_text(c) for c in node)
    return ""


def odds_den(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"1\s*in\s*([0-9][0-9,]*(?:\.[0-9]+)?)", s)
    return float(m.group(1).replace(",", "")) if m else None


def cap_date(ts: str) -> str:
    return f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}"


man = manifest()
tier_rows, game_rows, problems = [], [], []


def tier_records(g: dict, ts: str, url: str, source: str) -> list[dict]:
    tiers = g.get("prizeTiers") or []
    recs = []
    for t in tiers:
        desc = t.get("prizeDescription")
        adv = advertised(desc)
        val = t.get("prizeAmount")
        val = float(val) if val is not None else None
        is_ann = bool(desc and ANNUITY.search(desc))
        # EV value: the Lottery's prizeAmount when > 0, else the advertised amount (flagged).
        if val and val > 0:
            tv, basis = val, "prizeAmount"
        elif adv is not None and not is_ann:
            tv, basis = adv, "description (prizeAmount 0/missing)"
        else:
            tv, basis = None, "unvalued"
        recs.append(
            dict(
                game_id=int(g["massGameID"]),
                snapshot_date=cap_date(ts),
                capture_timestamp=ts,
                tier_number=t.get("tierNumber"),
                prize_description=desc,
                tier_value=tv,
                tier_value_basis=basis,
                value_advertised=adv,
                value_valuation=val,
                is_annuity=is_ann,
                annuity_values_differ=bool(is_ann and adv is not None and val is not None and abs(adv - val) > 0.5),
                total=t.get("totalPrizes"),
                paid=t.get("paidPrizes"),
                remaining=t.get("prizesRemaining"),
                tier_odds=t.get("odds"),
                tier_type=t.get("type"),
                is_launch_top_prize=None,
                source=source,
                capture_url=url,
            )
        )
    if source == "wayback_full" and recs:
        # Launch top prize = largest of (advertised, valuation) across the FULL table.
        key = [max(r["value_advertised"] or 0, r["value_valuation"] or 0) for r in recs]
        top = max(key)
        for r, k in zip(recs, key):
            r["is_launch_top_prize"] = bool(k == top and top > 0)
    return recs


# --- full per-game tables -----------------------------------------------------------
for f in sorted((RAW / "game_prizes").glob("*.json")):
    rel = str(f.relative_to(ROOT))
    m = man.get(rel, {})
    ts = f.name.split("_")[0]
    url = m.get("request_url", "")
    try:
        g = json.loads(f.read_bytes())
    except Exception as e:  # noqa: BLE001
        problems.append((rel, f"not JSON: {e}"))
        continue
    if not isinstance(g, dict) or "prizeTiers" not in g:
        problems.append((rel, f"unexpected shape: {str(g)[:80]}"))
        continue
    text = rich_text(g.get("prizeTierInfo", {}).get("text") if isinstance(g.get("prizeTierInfo"), dict) else None)
    pm = PRINTED.search(text or "")
    printed = int(pm.group(1).replace(",", "")) if pm else None
    recs = tier_records(g, ts, url, "wayback_full")
    tier_rows += recs
    game_rows.append(
        dict(
            game_id=int(g["massGameID"]),
            name=(g.get("gameName") or "").strip(),
            identifier=g.get("gameIdentifier"),
            price=float(g["ticketCost"]) if g.get("ticketCost") is not None else None,
            start_date=g.get("startDate"),
            tickets_printed=printed,
            tickets_printed_text=text.strip()[:200] if text else None,
            overall_odds=g.get("odds"),
            snapshot_date=cap_date(ts),
            capture_timestamp=ts,
            source="wayback_full",
            capture_url=url,
        )
    )

# --- summary (/special) --------------------------------------------------------------
for f in sorted((RAW / "special").glob("*.json")):
    rel = str(f.relative_to(ROOT))
    ts = f.name.split("_")[0]
    url = man.get(rel, {}).get("request_url", "")
    try:
        d = json.loads(f.read_bytes())
    except Exception as e:  # noqa: BLE001
        problems.append((rel, f"not JSON: {e}"))
        continue
    if not isinstance(d, list):
        problems.append((rel, "unexpected shape"))
        continue
    for g in d:
        tier_rows += tier_records(g, ts, url, "wayback_summary")
        game_rows.append(
            dict(
                game_id=int(g["massGameID"]),
                name=(g.get("gameName") or "").strip(),
                identifier=g.get("gameIdentifier"),
                price=float(g["ticketCost"]) if g.get("ticketCost") is not None else None,
                start_date=g.get("startDate"),
                tickets_printed=None,
                tickets_printed_text=None,
                overall_odds=None,
                snapshot_date=cap_date(ts),
                capture_timestamp=ts,
                source="wayback_summary",
                capture_url=url,
            )
        )

# --- catalog (/games) ----------------------------------------------------------------
cdx = json.loads((RAW / "cdx" / "cdx_games_api_prefix.json").read_text())
cdx_rows = [dict(zip(cdx[0], r)) for r in cdx[1:]]
cat_rows = [r for r in cdx_rows if r["original"].split("?")[0].rstrip("/").endswith("/api/v1/games")]
digest_file = {}
for f in sorted((RAW / "catalog").glob("*.json")):
    ts = f.name.split("_")[0]
    for r in cat_rows:
        if r["timestamp"] == ts:
            digest_file[r["digest"]] = f
for r in cat_rows:
    f = digest_file.get(r["digest"])
    if f is None:
        problems.append((r["timestamp"], "catalog capture not fetched / revisit without base"))
        continue
    rel = str(f.relative_to(ROOT))
    url = man.get(rel, {}).get("request_url", "")
    try:
        d = json.loads(f.read_bytes())
    except Exception as e:  # noqa: BLE001
        problems.append((rel, f"not JSON: {e}"))
        continue
    for g in d if isinstance(d, list) else []:
        if g.get("gameType") != "Scratch":
            continue
        game_rows.append(
            dict(
                game_id=int(g["id"]),
                name=(g.get("name") or "").strip(),
                identifier=g.get("identifier"),
                price=float(g["price"]) if g.get("price") is not None else None,
                start_date=g.get("startDate"),
                tickets_printed=None,
                tickets_printed_text=None,
                overall_odds=g.get("odds"),
                snapshot_date=cap_date(r["timestamp"]),
                capture_timestamp=r["timestamp"],
                source="wayback_catalog" + ("_revisit" if r["statuscode"] == "-" else ""),
                capture_url=url,
                catalog_tags=",".join(g.get("tags") or []),
                catalog_expiration_date=g.get("expirationDate"),
            )
        )

tiers = pl.DataFrame(tier_rows, infer_schema_length=None)
games = pl.DataFrame(game_rows, infer_schema_length=None)
OUT.mkdir(parents=True, exist_ok=True)
tiers.write_parquet(OUT / "prize_tiers_history.parquet")
games.write_parquet(OUT / "games_history.parquet")

# --- tickets printed: stated per capture; fallbacks documented ----------------------
stated = (
    games.filter(pl.col("source") == "wayback_full")
    .select("game_id", "capture_timestamp", "snapshot_date", "tickets_printed")
)
live_printed = {}
for f in LIVE.glob("*_instant-game-prizes_gameID-*.json"):
    g = json.loads(f.read_bytes())
    pm = PRINTED.search(rich_text(g.get("prizeTierInfo", {}).get("text")))
    if pm:
        live_printed[int(g["massGameID"])] = (int(pm.group(1).replace(",", "")), f.name[:16])


def printed_for(game_id: int, ts: str):
    own = stated.filter((pl.col("game_id") == game_id) & (pl.col("capture_timestamp") == ts))
    if own.height and own["tickets_printed"][0] is not None:
        return own["tickets_printed"][0], None
    others = stated.filter(
        (pl.col("game_id") == game_id) & pl.col("tickets_printed").is_not_null() & (pl.col("capture_timestamp") != ts)
    )
    if others.height:
        o = others.with_columns(
            (pl.col("snapshot_date").str.to_date() - pl.lit(cap_date(ts)).str.to_date()).abs().alias("gap")
        ).sort("gap").row(0, named=True)
        return o["tickets_printed"], f"tickets printed taken from the Wayback capture of {o['snapshot_date']}"
    if game_id in live_printed:
        v, stamp = live_printed[game_id]
        return v, f"tickets printed taken from the live Lottery response fetched {stamp}"
    return None, None


catalog = games.filter(pl.col("source").str.starts_with("wayback_catalog"))
cat_dates = catalog.select("snapshot_date").unique().with_columns(pl.col("snapshot_date").str.to_date().alias("d"))
ev_rows, ev_skipped = [], []
full = tiers.filter(pl.col("source") == "wayback_full")
for (gid, ts), grp in full.group_by(["game_id", "capture_timestamp"], maintain_order=True):
    gmeta = games.filter((pl.col("game_id") == gid) & (pl.col("capture_timestamp") == ts)).row(0, named=True)
    price = gmeta["price"]
    printed, note_extra = printed_for(gid, ts)
    date = cap_date(ts)
    if printed is None:
        ev_skipped.append((gid, date, "no tickets-printed figure in any capture"))
        continue
    if grp["tier_value"].null_count():
        ev_skipped.append((gid, date, "a tier has no usable cash value"))
        continue
    bad = grp.filter(pl.col("remaining") != pl.col("total") - pl.col("paid"))
    if bad.height:
        ev_skipped.append((gid, date, "remaining != total - paid"))
        continue
    low_v = grp["tier_value"].min()
    low = grp.filter(pl.col("tier_value") == low_v)
    low_tot, low_rem = int(low["total"].sum()), int(low["remaining"].sum())
    if low_tot <= 0 or low_rem <= 0:
        ev_skipped.append((gid, date, "lowest tier total/remaining is 0"))
        continue
    t_rem = printed * low_rem / low_tot
    pool_all = float((grp["remaining"] * grp["tier_value"]).sum())
    pool_ex = float(grp.filter(~pl.col("is_launch_top_prize"))
                    .select((pl.col("remaining") * pl.col("tier_value")).sum()).item())
    # validation: printed vs totalPrizes x tier odds denominator
    implied = [t * d for t, d in zip(grp["total"], [odds_den(o) for o in grp["tier_odds"]]) if d]
    implied_med = sorted(implied)[len(implied) // 2] if implied else None
    note = f"Wayback full prize table captured {date}"
    if note_extra:
        note += f"; {note_extra}"
    ann = grp.filter(pl.col("is_annuity") & (pl.col("remaining") > 0))
    if ann.height:
        note += "; annuity tier(s) valued at the Lottery's prizeAmount, an assumption"
    if (grp["tier_value_basis"] != "prizeAmount").any():
        note += "; a tier with prizeAmount 0 valued from its description"
    ev_all = pool_all / t_rem - price
    ev_ex = pool_ex / t_rem - price
    flags = []
    # (a) this capture's prizeAmount disagrees with the majority value across all captures
    for row in grp.iter_rows(named=True):
        vals = tiers.filter((pl.col("game_id") == gid) & (pl.col("tier_number") == row["tier_number"])
                            )["value_valuation"].drop_nulls().to_list()
        mode = max(set(vals), key=vals.count) if vals else None
        if mode is not None and vals.count(mode) > len(vals) / 2 and abs(mode - (row["value_valuation"] or 0)) > 0.5:
            flags.append(f"tier {row['tier_number']} prizeAmount {row['value_valuation']:,.0f} here vs "
                         f"{mode:,.0f} in {vals.count(mode)} of {len(vals)} captures")
    # (b) status in the nearest catalog capture (within 45 days)
    near = cat_dates.with_columns((pl.col("d") - pl.lit(date).str.to_date()).abs().alias("gap")) \
        .filter(pl.col("gap") <= pl.duration(days=45)).sort("gap")
    if near.height:
        cd = near["snapshot_date"][0]
        hit = catalog.filter((pl.col("snapshot_date") == cd) & (pl.col("game_id") == gid))
        if hit.height == 0:
            flags.append(f"not listed in catalog capture {cd}")
        elif "Expiring Game" in (hit["catalog_tags"][0] or ""):
            flags.append(f"claims-only (Expiring Game) in catalog capture {cd}")
    # (c) lowest tier nearly exhausted
    if low_rem / low_tot < 0.05:
        flags.append(f"lowest tier {low_rem / low_tot:.1%} remaining: tickets-remaining estimate unstable")
    ev_rows.append(
        dict(
            game_id=gid,
            as_of=date,
            capture_timestamp=ts,
            price=price,
            tickets_printed=printed,
            tickets_printed_implied_by_odds=implied_med,
            lowest_tier_value=low_v,
            lowest_tier_remaining=low_rem,
            lowest_tier_total=low_tot,
            tickets_remaining_est=t_rem,
            ev_all=ev_all,
            ev_ex_jackpot=ev_ex,
            check_inputs=bool(ev_all > 0 or ev_ex > 0),
            input_flags="; ".join(flags) or None,
            method_note=note,
        )
    )

ev = pl.DataFrame(ev_rows, infer_schema_length=None)
ev.write_parquet(OUT / "ev_history.parquet")

print("tiers", tiers.height, tiers.group_by("source").len().sort("source").rows())
print("games", games.height, games.group_by("source").len().sort("source").rows())
print("ev rows", ev.height, "skipped", len(ev_skipped))
for s in ev_skipped:
    print("  skip", s)
print("problems", len(problems))
for p in problems[:20]:
    print("  ", p)
