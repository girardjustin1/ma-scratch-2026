"""Daily local data refresh: one idempotent entry point (run by launchd at 07:15, or by hand).

  a. Winners: every missing listed day through yesterday (America/New_York), one request a day.
  b. Game catalog + prize tables: at most once per calendar day.
  c. Retailers: a fresh statewide sweep only when the last complete one is over 30 days old.
  d. Rebuild data/processed (claims, retailer matches) and web/public/local/view.json + pace.json,
     when any input changed since the last successful rebuild.
  e. Run the report publisher (npm --prefix web run reports:publish) if it is installed.

Network: Mass Lottery public endpoints only (www.masslottery.com), >= 1.3 s apart, with retries.
Nothing here is committed: data/ and web/public/local/ are gitignored (Lottery terms forbid
redistribution). Exit code is non-zero only on a real failure; a lock file under data/ stops
two runs overlapping.

    uv run --with duckdb --with pandas --with pyarrow --with numpy --with shapely \\
        python3 scripts/update_data.py [--rebuild] [--no-publish] [--geocode-new]
"""

from __future__ import annotations

import datetime as dt
import fcntl
import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

# scripts/ is on sys.path because this file is run as scripts/update_data.py
import fetch_prizes_remaining
import fetch_winners
import process_retailers
import process_winners
import sweep_retailers

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "data/update_data.lock"
STATE = ROOT / "data/state/update_state.json"
VIEW = ROOT / "web/public/local/view.json"
PACE = ROOT / "web/public/local/pace.json"
RETAILER_MAX_AGE_DAYS = 30


def log(msg: str) -> None:
    print(f"[{dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def fingerprint() -> dict:
    """What the rebuild depends on. A change in any of these triggers steps d."""
    def mtime(p: Path):
        return p.stat().st_mtime_ns if p.exists() else None
    days = sorted(p.stem for p in fetch_winners.DAILY.glob("*.json"))
    return {"winner_days": len(days), "last_day": days[-1] if days else None,
            "winners_manifest": mtime(fetch_winners.MANIFEST),
            "catalog": fetch_prizes_remaining.latest_catalog().name,
            "prizes": mtime(fetch_prizes_remaining.OUT),
            "retailers": mtime(process_winners.P / "retailers_ma.csv")}


def step(name: str, fn, summary: dict, failures: list):
    t0 = time.time()
    try:
        res = fn()
        summary[name] = res
        log(f"{name}: ok ({time.time() - t0:.0f}s)")
        return res
    except Exception as e:  # noqa: BLE001 - one failed step is reported; the others still run
        failures.append(f"{name}: {e}")
        log(f"{name}: FAILED {e}")
        traceback.print_exc()
        return None


def winners(summary: dict, failures: list) -> None:
    res = step("winners", fetch_winners.update, summary, failures)
    if res is None:
        return
    saved = [r for r in res if r["status"] == "saved"]
    for r in saved:
        log(f"  winners {r['day']}: {r['rows']} rows (API total {r['total']}{'' if r['match'] else ', MISMATCH'})")
    for r in res:
        if r["status"] == "not_posted":
            log(f"  winners {r['day']}: not posted yet (0 rows); will ask again next run")
        if r["status"] == "failed":
            failures.append(f"winners {r['day']}: {r['error']}")
            log(f"  winners {r['day']}: FAILED {r['error']}")
        if r["status"] == "saved" and not r["match"]:
            failures.append(f"winners {r['day']}: rows {r['rows']} != API total {r['total']}")
    if not res:
        log("  winners: nothing missing")
    summary["winners"] = {"days_saved": len(saved), "rows_saved": sum(r["rows"] for r in saved),
                          "not_posted": [r["day"] for r in res if r["status"] == "not_posted"]}


def prizes(summary: dict, failures: list) -> None:
    cat = step("catalog", fetch_prizes_remaining.fetch_catalog, summary, failures)
    if cat:
        log(f"  catalog: {cat['catalog']} {cat['file']}")
    res = step("prizes", fetch_prizes_remaining.fetch_prizes, summary, failures)
    if res:
        if res["prizes"] == "saved":
            log(f"  prizes: {res['games']}/{res['of']} games, {res['tiers']} tiers, as of {res['as_of']}"
                + (f"; {len(res['failed'])} failed, {res['carried_forward']} kept previous rows" if res["failed"] else ""))
            if res["failed"]:
                failures.append(f"prizes: {len(res['failed'])} games failed (previous rows kept)")
        else:
            log(f"  prizes: {res['prizes']}")


def retailers(summary: dict, failures: list, geocode_new: bool) -> None:
    last_dir, last_t = sweep_retailers.last_complete_sweep()
    age = (dt.datetime.now(dt.UTC) - last_t).days if last_t else None
    pending = sweep_retailers.incomplete_sweep()
    if pending is None and age is not None and age <= RETAILER_MAX_AGE_DAYS:
        log(f"retailers: last sweep {last_dir.name} is {age} days old; next sweep after {RETAILER_MAX_AGE_DAYS} days")
        summary["retailers"] = {"skipped": True, "age_days": age}
        return
    out = pending or sweep_retailers.BASE / f"sweep_statewide_{dt.date.today():%Y%m%d}"
    log(f"retailers: sweeping into {out.name} (last complete sweep {age} days old)")
    res = step("retailer_sweep", lambda: sweep_retailers.sweep(out), summary, failures)
    if res is None:
        return
    res = step("retailer_process", lambda: process_retailers.run(out, geocode_new=geocode_new), summary, failures)
    if res:
        log(f"  retailers: {res['retailers']} listed, {res['carried_forward']} carried forward, "
            f"{res['not_geocoded']} new/changed addresses not geocoded (not placed; run with --geocode-new by hand)")


def run_script(name: str) -> dict:
    cmd = [sys.executable, str(ROOT / "scripts" / name)]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
    if p.returncode != 0:
        raise RuntimeError(f"{name} exit {p.returncode}: {(p.stderr or p.stdout).strip()[-600:]}")
    return {"output": p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ""}


def rebuild(summary: dict, failures: list, force: bool) -> None:
    fp = fingerprint()
    old = json.loads(STATE.read_text()) if STATE.exists() else {}
    if not force and old.get("fingerprint") == fp and VIEW.exists() and PACE.exists():
        log("rebuild: inputs unchanged since the last rebuild; skipped")
        summary["rebuild"] = "skipped"
        return
    n0 = len(failures)
    res = step("process_winners", process_winners.run, summary, failures)
    if res:
        log(f"  claims: {res['days']} days {res['first']} → {res['last']}, {res['scratch_rows']:,} scratch rows, "
            f"{res['matched']:,} matched, {res['in_tract']:,} in a verified tract")
    if len(failures) == n0:
        for name in ("build_local_view.py", "game_pace.py"):
            r = step(name, lambda n=name: run_script(n), summary, failures)
            if r is None:
                break
            log(f"  {name}: {r['output'][:300]}")
    if len(failures) == n0:
        cov = json.loads(VIEW.read_text())["coverage"]
        summary["coverage"] = cov["dateTo"]
        log(f"rebuild: ok; view.json covers {cov['dateFrom']} → {cov['dateTo']}")
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps({"fingerprint": fp, "rebuilt_at": dt.datetime.now().isoformat(timespec="seconds"),
                                     "coverage_to": cov["dateTo"]}, indent=1))


def publish(summary: dict, failures: list) -> None:
    pkg = json.loads((ROOT / "web/package.json").read_text())
    if "reports:publish" not in pkg.get("scripts", {}):
        log("publisher not installed yet")
        summary["publish"] = "not installed"
        return
    t0 = time.time()
    p = subprocess.run(["npm", "--prefix", "web", "run", "reports:publish"], cwd=ROOT, capture_output=True, text=True, check=False)
    tail = "\n".join((p.stdout + p.stderr).strip().splitlines()[-8:])
    if p.returncode != 0:
        failures.append(f"publish: exit {p.returncode}")
        log(f"publish: FAILED exit {p.returncode} ({time.time() - t0:.0f}s)\n{tail}")
    else:
        log(f"publish: ok ({time.time() - t0:.0f}s)\n{tail}")
    summary["publish"] = p.returncode


def main() -> int:
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    lock = LOCK.open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another update is running (lock held); exiting")
        return 0
    t0 = time.time()
    log(f"update start (today {fetch_winners.today_ny()} America/New_York)")
    summary, failures = {}, []
    winners(summary, failures)
    prizes(summary, failures)
    retailers(summary, failures, "--geocode-new" in sys.argv)
    rebuild(summary, failures, "--rebuild" in sys.argv)
    if "--no-publish" in sys.argv:
        log("publish: skipped (--no-publish)")
    else:
        publish(summary, failures)
    w = summary.get("winners") or {}
    cov_to = summary.get("coverage") or (json.loads(VIEW.read_text())["coverage"]["dateTo"] if VIEW.exists() else "-")
    log(f"SUMMARY days fetched={w.get('days_saved', 0)} rows={w.get('rows_saved', 0)} "
        f"not_posted={','.join(w.get('not_posted', [])) or '-'} "
        f"catalog={(summary.get('catalog') or {}).get('catalog', 'failed')} "
        f"prizes={(summary.get('prizes') or {}).get('prizes', 'failed')} "
        f"retailers={'skipped' if (summary.get('retailers') or {}).get('skipped') else 'refreshed/attempted'} "
        f"rebuild={summary.get('rebuild', 'ok' if 'coverage' in summary else 'failed')} "
        f"coverage_to={cov_to} failures={len(failures)} ({time.time() - t0:.0f}s)")
    for f in failures:
        log(f"FAILURE {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
