"""Hex study: can anything forecast where listed claims land next week, beyond how busy an
area already is?

Implements the spatiotemporal-risk brief as an offline backtest (PRD milestone 5,
"Exploratory ML"): H3 cells, weekly bins, lag and neighbor features, baselines, Poisson
GLM and gradient-boosted trees, time-ordered and spatially blocked validation. The output
is a REPORT, not a map layer. The project rule still holds: never predict or rank winning
stores on the dashboard.

Why weekly, not daily or hourly: the data has no time of day, and listed dates follow the
Lottery's claim processing, so a daily bin measures the office's schedule (see the
"Lottery listing schedule" chart). A week smooths that out.

    # real local data (gitignored inputs and outputs)
    uv run --with duckdb --with h3 --with lightgbm --with scikit-learn --with pandas --with pyarrow \\
        python3 scripts/hex_study.py
    # synthetic data: a null world (wins are luck on top of store volume) and a positive
    # control (stores have real hot streaks); checks the pipeline can find a signal
    ... python3 scripts/hex_study.py --synthetic

Writes data/processed/hex_study/ (gitignored): report_<source>.json and, per resolution,
a descriptive hex GeoJSON (past listed claims per cell). Forecast fields appear in the
example payload for synthetic data only.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import mean_poisson_deviance

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data/processed"
OUT = P / "hex_study"

# Everything tunable lives here, so resolution, bins and features are configuration.
CONFIG = {
    "resolutions": [7, 8],  # ~5.2 km² and ~0.74 km² cells
    "block_res": 5,  # spatial CV blocks: H3 parents at res 5 (~250 km²)
    "min_history_weeks": 26,  # PRD gate; also the first week a target can be scored
    "test_weeks": 52,  # backtest: the last year of target weeks
    "retrain_every": 13,  # expanding-window retrain cadence inside the test year
    "top_k": [0.01, 0.05, 0.10],  # capture of next week's claims by the top k% of cells
    "spatial_folds": 5,
    "seed": 7,
    "gbt": {"objective": "poisson", "learning_rate": 0.05, "n_estimators": 300, "num_leaves": 31,
            "min_child_samples": 200, "subsample": 0.8, "subsample_freq": 1, "colsample_bytree": 0.9, "verbose": -1},
}
VOLUME_FEATURES = ["log_nret", "mean52", "mean_all", "woy_sin", "woy_cos", "state4"]
RECENCY_FEATURES = ["lag1", "mean4", "mean13", "nbr13", "nbr4"]
FULL_FEATURES = VOLUME_FEATURES + RECENCY_FEATURES


# ---------------------------------------------------------------- inputs


@dataclass
class Events:
    """Point events at stores. week = Monday-start week index from the first full week."""
    stores: pd.DataFrame  # store_id, lat, lon
    events: pd.DataFrame  # store_id, week
    weeks: int
    week0: str
    source: str
    notes: list[str] = field(default_factory=list)


def load_real() -> Events:
    import duckdb

    con = duckdb.connect()
    stores = con.execute(
        f"SELECT retailer_id AS store_id, lat, lon FROM read_csv_auto('{P / 'retailers_ma.csv'}') "
        "WHERE lat IS NOT NULL AND lon IS NOT NULL"
    ).df()
    ev = con.execute(
        f"SELECT retailer_id AS store_id, listed_date FROM read_parquet('{P / 'claims_tract_ma.parquet'}') "
        "WHERE retailer_id IS NOT NULL"
    ).df()
    ev["listed_date"] = pd.to_datetime(ev["listed_date"])
    first = ev["listed_date"].min()
    monday = first + pd.Timedelta(days=(7 - first.weekday()) % 7)  # first full week
    last = ev["listed_date"].max()
    end = last - pd.Timedelta(days=(last.weekday() + 1) % 7)  # last full week's Sunday
    ev = ev[(ev["listed_date"] >= monday) & (ev["listed_date"] <= end)].copy()
    ev["week"] = ((ev["listed_date"] - monday).dt.days // 7).astype(int)
    ev = ev[ev["store_id"].isin(stores["store_id"])]
    return Events(stores, ev[["store_id", "week"]], int(ev["week"].max()) + 1, str(monday.date()), "real", [
        ("Retailer list is a current snapshot: stores that closed or opened during the window are counted "
         "for every week (small leakage in the retailer-count feature)."),
        "Claims are located at the SELLING store; a cell's count is the sum over its stores.",
        "Listed claims only (prizes over $600). Unmatched claims are excluded, so counts are a floor.",
    ])


def make_synthetic(hot: float, weeks: int = 156, n_stores: int = 6000, seed: int = 7) -> Events:
    """Stores scattered over a Massachusetts-sized box. Each has a fixed volume (lognormal,
    clustered in a few 'towns'); weekly counts are Poisson around volume × season × an
    office-schedule factor. With hot > 0 every store also has an AR(1) streak state, so
    recent activity truly predicts next week: the positive control."""
    rng = np.random.default_rng(seed)
    towns = rng.uniform([41.5, -73.2], [42.75, -70.1], size=(40, 2))
    t = rng.integers(0, len(towns), n_stores)
    latlon = towns[t] + rng.normal(0, 0.06, size=(n_stores, 2))
    vol = rng.lognormal(mean=0, sigma=1.0, size=n_stores)
    vol *= 2200 / vol.sum()  # ~2,200 listed claims a week statewide, like the real list
    season = 1 + 0.12 * np.sin(2 * np.pi * np.arange(weeks) / 52)
    office = rng.gamma(40, 1 / 40, size=weeks)
    state = np.zeros(n_stores)
    rows = []
    for w in range(weeks):
        state = 0.85 * state + rng.normal(0, 0.35, n_stores) if hot > 0 else state
        mu = vol * season[w] * office[w] * np.exp(hot * state - (hot * 0.35) ** 2 / (2 * (1 - 0.85 ** 2)))
        n = rng.poisson(mu)
        idx = np.repeat(np.arange(n_stores), n)
        rows.append(np.column_stack([idx, np.full(len(idx), w)]))
    ev = pd.DataFrame(np.vstack(rows), columns=["store_id", "week"])
    stores = pd.DataFrame({"store_id": np.arange(n_stores), "lat": latlon[:, 0], "lon": latlon[:, 1]})
    return Events(stores, ev, weeks, "synthetic", f"synthetic-{'hot' if hot > 0 else 'null'}",
                  ["Synthetic data; no Lottery rows."])


# ---------------------------------------------------------------- panel and features


@dataclass
class Panel:
    cells: list[str]
    counts: np.ndarray  # cells × weeks
    nret: np.ndarray
    neighbors: list[np.ndarray]
    block: np.ndarray  # spatial CV group per cell


def build_panel(ev: Events, res: int) -> Panel:
    stores = ev.stores.copy()
    stores["cell"] = [h3.latlng_to_cell(a, b, res) for a, b in zip(stores["lat"], stores["lon"])]
    cells = sorted(stores["cell"].unique())
    index = {c: i for i, c in enumerate(cells)}
    nret = stores.groupby("cell").size().reindex(cells).to_numpy()
    store_cell = stores.set_index("store_id")["cell"].map(index)
    ci = store_cell.reindex(ev.events["store_id"]).to_numpy()
    counts = np.zeros((len(cells), ev.weeks), dtype=np.int32)
    np.add.at(counts, (ci, ev.events["week"].to_numpy()), 1)
    neighbors = [np.array([index[n] for n in h3.grid_disk(c, 1) if n != c and n in index], dtype=int) for c in cells]
    blocks = pd.factorize(pd.Series([h3.cell_to_parent(c, CONFIG["block_res"]) for c in cells]))[0]
    return Panel(cells, counts, nret, neighbors, blocks)


def window_mean(cs: np.ndarray, t: int, k: int) -> np.ndarray:
    """Mean weekly count over weeks t-k+1..t from a cumulative-sum matrix (cells × weeks+1)."""
    lo = max(0, t - k + 1)
    return (cs[:, t + 1] - cs[:, lo]) / (t + 1 - lo)


def features(p: Panel) -> pd.DataFrame:
    """One row per cell and target week T = t+1, using only weeks ≤ t."""
    C = p.counts
    W = C.shape[1]
    cs = np.concatenate([np.zeros((C.shape[0], 1)), np.cumsum(C, axis=1)], axis=1)
    state_total = C.sum(axis=0)

    def nb_sum(v: np.ndarray) -> np.ndarray:
        return np.array([v[n].sum() for n in p.neighbors])

    frames = []
    for t in range(CONFIG["min_history_weeks"] - 1, W - 1):
        m4, m13 = window_mean(cs, t, 4), window_mean(cs, t, 13)
        T = t + 1
        frames.append(pd.DataFrame({
            "cell": np.arange(len(p.cells)), "week": T, "block": p.block,
            "log_nret": np.log(p.nret), "nret": p.nret,
            "lag1": C[:, t], "mean4": m4, "mean13": m13,
            "mean52": window_mean(cs, t, 52), "mean_all": window_mean(cs, t, t + 1),
            # Split-half references for the streak test: alternate weeks of t-55..t-4,
            # disjoint from the last 4 weeks and from each other.
            "ref_a": C[:, max(0, t - 55): t - 3][:, 0::2].mean(axis=1),
            "ref_b": C[:, max(0, t - 55): t - 3][:, 1::2].mean(axis=1),
            "nbr13": nb_sum(m13), "nbr4": nb_sum(m4),
            "woy_sin": math.sin(2 * math.pi * T / 52), "woy_cos": math.cos(2 * math.pi * T / 52),
            "state4": state_total[max(0, t - 3): t + 1].mean(),
            "y": C[:, T],
        }))
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------- models


def fit_gbt(train: pd.DataFrame, cols: list[str]):
    m = lgb.LGBMRegressor(random_state=CONFIG["seed"], **CONFIG["gbt"])
    m.fit(train[cols], train["y"])
    return m


def fit_glm(train: pd.DataFrame, cols: list[str]):
    X = np.log1p(train[cols].clip(lower=0)) if cols else None
    mu, sd = X.mean(), X.std().replace(0, 1)
    m = PoissonRegressor(alpha=1e-4, max_iter=300).fit((X - mu) / sd, train["y"])
    return lambda d: m.predict((np.log1p(d[cols].clip(lower=0)) - mu) / sd)


GLM_COLS = ["nret", "mean52", "mean_all", "lag1", "mean4", "mean13", "nbr13", "state4"]


def predict_all(train: pd.DataFrame, test: pd.DataFrame) -> dict[str, np.ndarray]:
    """Every model's expected count for the test rows. Baselines need no training."""
    out = {
        "last week": test["lag1"].to_numpy(float),
        "last 4 weeks": test["mean4"].to_numpy(float),
        "last 52 weeks (volume baseline)": test["mean52"].to_numpy(float),
    }
    out["GBT · volume features only"] = fit_gbt(train, VOLUME_FEATURES).predict(test[VOLUME_FEATURES])
    full = fit_gbt(train, FULL_FEATURES)
    out["GBT · volume + recency"] = full.predict(test[FULL_FEATURES])
    out["Poisson GLM · volume + recency"] = fit_glm(train, GLM_COLS)(test)
    predict_all.last_full = full  # for feature importance
    return out


# ---------------------------------------------------------------- metrics


def capture(test: pd.DataFrame, mu: np.ndarray, k: float) -> float:
    """Mean over test weeks of the share of that week's claims in the top-k% cells by mu."""
    d = pd.DataFrame({"week": test["week"].to_numpy(), "y": test["y"].to_numpy(), "mu": mu})
    shares = []
    for _, g in d.groupby("week"):
        n = max(1, round(k * len(g)))
        top = g.nlargest(n, "mu")
        if g["y"].sum() > 0:
            shares.append(top["y"].sum() / g["y"].sum())
    return float(np.mean(shares))


def calibration(y: np.ndarray, mu: np.ndarray, bins: int = 10) -> list[dict]:
    """P(≥1 listed claim next week) = 1 − e^(−mu), binned by predicted probability."""
    p = 1 - np.exp(-mu)
    hit = (y > 0).astype(float)
    edges = np.quantile(p, np.linspace(0, 1, bins + 1))
    b = np.clip(np.searchsorted(edges, p, side="right") - 1, 0, bins - 1)
    return [{"predicted": round(float(p[b == i].mean()), 4), "observed": round(float(hit[b == i].mean()), 4),
             "n": int((b == i).sum())} for i in range(bins) if (b == i).any()]


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = pd.Series(a).rank().to_numpy(), pd.Series(b).rank().to_numpy()
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def streak_test(df: pd.DataFrame) -> dict:
    """Hot-streak check: does a cell's recent excess over its own earlier rate line up with
    next week's excess? Recent excess = mean4 − ref_a, next excess = y − ref_b, where ref_a
    and ref_b are alternate weeks of the prior year (excluding the last 4), so no noise is
    shared between the two sides. Per-week Spearman across active cells, then a 95%
    interval over weeks. ~0 means 'no area is hot or due'."""
    rhos = []
    for _, g in df[(df["ref_a"] > 0) & (df["ref_b"] > 0)].groupby("week"):
        r = spearman((g["mean4"] - g["ref_a"]).to_numpy(), (g["y"] - g["ref_b"]).to_numpy())
        if not math.isnan(r):
            rhos.append(r)
    r = np.array(rhos)
    half = 1.96 * r.std(ddof=1) / math.sqrt(len(r))
    return {"mean_rho": round(float(r.mean()), 4), "ci95": [round(float(r.mean() - half), 4), round(float(r.mean() + half), 4)],
            "weeks": len(r)}


def evaluate(df: pd.DataFrame) -> dict:
    W = int(df["week"].max()) + 1
    start = W - CONFIG["test_weeks"]
    preds: dict[str, list[np.ndarray]] = {}
    tests = []
    importance = None
    for b0 in range(start, W, CONFIG["retrain_every"]):
        train = df[df["week"] < b0]
        test = df[(df["week"] >= b0) & (df["week"] < b0 + CONFIG["retrain_every"])]
        for name, mu in predict_all(train, test).items():
            preds.setdefault(name, []).append(np.clip(mu, 1e-6, None))
        tests.append(test)
        importance = predict_all.last_full.booster_.feature_importance("gain")
    test = pd.concat(tests, ignore_index=True)
    y = test["y"].to_numpy()
    base = "last 52 weeks (volume baseline)"
    mus = {k: np.concatenate(v) for k, v in preds.items()}
    dev_base = mean_poisson_deviance(y, mus[base])
    models = {}
    for name, mu in mus.items():
        dev = mean_poisson_deviance(y, mu)
        p = 1 - np.exp(-mu)
        models[name] = {
            "poisson_deviance": round(float(dev), 5),
            "skill_vs_volume_baseline": round(float(1 - dev / dev_base), 4),
            "brier_any": round(float(np.mean((p - (y > 0)) ** 2)), 5),
            **{f"capture_top_{int(k * 100)}pct": round(capture(test, mu, k), 4) for k in CONFIG["top_k"]},
        }
    # Hindsight ceiling for capture: if you knew each cell's TRUE long-run rate (the full
    # window's mean, including the test year), how much could the top k% capture?
    hindsight = df.groupby("cell")["y"].mean()
    ceiling = test["cell"].map(hindsight).to_numpy()
    models["hindsight long-run rate (ceiling, not a model)"] = {
        f"capture_top_{int(k * 100)}pct": round(capture(test, ceiling, k), 4) for k in CONFIG["top_k"]}
    gain = dict(zip(FULL_FEATURES, (importance / importance.sum()).round(4).tolist()))
    return {
        "test_weeks": [int(start), int(W - 1)],
        "test_rows": len(test),
        "models": models,
        "calibration_gbt_full": calibration(y, mus["GBT · volume + recency"]),
        "feature_gain_share": dict(sorted(gain.items(), key=lambda kv: -kv[1])),
        "streak_test": streak_test(test),
        "spatial_blocked": spatial_blocked(df, start),
    }


def spatial_blocked(df: pd.DataFrame, start: int) -> dict:
    """Train on earlier weeks of some regions, test on the test year of held-out regions."""
    blocks = df["block"].unique()
    rng = np.random.default_rng(CONFIG["seed"])
    fold = dict(zip(blocks, rng.permutation(len(blocks)) % CONFIG["spatial_folds"]))
    f = df["block"].map(fold)
    ys, mv, mf = [], [], []
    for k in range(CONFIG["spatial_folds"]):
        train = df[(f != k) & (df["week"] < start)]
        test = df[(f == k) & (df["week"] >= start)]
        ys.append(test["y"].to_numpy())
        mv.append(fit_gbt(train, VOLUME_FEATURES).predict(test[VOLUME_FEATURES]))
        mf.append(fit_gbt(train, FULL_FEATURES).predict(test[FULL_FEATURES]))
    y = np.concatenate(ys)
    base = np.clip(np.concatenate([df[(f == k) & (df["week"] >= start)]["mean52"].to_numpy() for k in range(CONFIG["spatial_folds"])]), 1e-6, None)
    d0 = mean_poisson_deviance(y, base)
    return {name: round(float(1 - mean_poisson_deviance(y, np.clip(np.concatenate(m), 1e-6, None)) / d0), 4)
            for name, m in [("GBT · volume features only", mv), ("GBT · volume + recency", mf)]} | {"note": "skill vs volume baseline on held-out regions"}


# ---------------------------------------------------------------- outputs


def poisson_interval(mu: float, q: float) -> int:
    """Smallest k with P(N ≤ k) ≥ q for N ~ Poisson(mu)."""
    k, pmf = 0, math.exp(-mu)
    cdf = pmf
    while cdf < q:
        k += 1
        pmf *= mu / k
        cdf += pmf
    return k


def hex_geojson(p: Panel, res: int, week0: str, df: pd.DataFrame | None, with_forecast: bool) -> dict:
    """Descriptive payload: listed claims per cell over the whole window and the last 13
    weeks. With with_forecast (synthetic only), adds the example forecast fields the brief
    asks for: expected count next week, P(≥1) and a 90% interval."""
    total, last13 = p.counts.sum(axis=1), p.counts[:, -13:].sum(axis=1)
    fc = {}
    if with_forecast and df is not None:
        last = int(df["week"].max())
        model = fit_gbt(df[df["week"] < last], FULL_FEATURES)
        rows = df[df["week"] == last]
        fc = dict(zip(rows["cell"], model.predict(rows[FULL_FEATURES])))
    feats = []
    for i, c in enumerate(p.cells):
        ring = [[round(lon, 6), round(lat, 6)] for lat, lon in h3.cell_to_boundary(c)]
        props = {"h3": c, "res": res, "retailers": int(p.nret[i]), "listed_claims": int(total[i]),
                 "listed_claims_last13w": int(last13[i]), "per_retailer": round(float(total[i] / p.nret[i]), 2)}
        if i in fc:
            mu = float(max(fc[i], 1e-6))
            props |= {"expected_next_week": round(mu, 3), "p_any_next_week": round(1 - math.exp(-mu), 4),
                      "interval90": [poisson_interval(mu, 0.05), poisson_interval(mu, 0.95)]}
        feats.append({"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [ring + [ring[0]]]}})
    return {"type": "FeatureCollection", "properties": {"week0": week0, "weeks": int(p.counts.shape[1]), "res": res,
            "kind": "example forecast (synthetic)" if fc else "descriptive (past listed claims)"}, "features": feats}


def run(ev: Events, with_forecast: bool) -> dict:
    report = {"source": ev.source, "config": CONFIG, "notes": ev.notes, "weeks": ev.weeks, "events": len(ev.events),
              "stores": len(ev.stores), "by_resolution": {}}
    OUT.mkdir(parents=True, exist_ok=True)
    for res in CONFIG["resolutions"]:
        t0 = time.time()
        p = build_panel(ev, res)
        df = features(p)
        r = {
            "cells_with_stores": len(p.cells),
            "avg_cell_km2": round(h3.average_hexagon_area(res, "km^2"), 2),
            "panel_rows": len(df),
            "panel_mb": round(df.memory_usage(deep=True).sum() / 1e6, 1),
            "share_cell_weeks_zero": round(float((p.counts == 0).mean()), 4),
            "mean_claims_per_cell_week": round(float(p.counts.mean()), 4),
        }
        r |= evaluate(df)
        gj = hex_geojson(p, res, ev.week0, df, with_forecast)
        (OUT / f"hex_r{res}_{ev.source}.geojson").write_text(json.dumps(gj))
        r["seconds"] = round(time.time() - t0, 1)
        report["by_resolution"][str(res)] = r
        print_summary(ev.source, res, r)
    (OUT / f"report_{ev.source}.json").write_text(json.dumps(report, indent=2))
    return report


def print_summary(source: str, res: int, r: dict) -> None:
    print(f"\n== {source} · H3 res {res} · {r['cells_with_stores']:,} cells · {r['panel_rows']:,} rows "
          f"· {r['share_cell_weeks_zero']:.0%} cell-weeks zero · {r['seconds']}s")
    print(f"{'model':<48}{'skill':>8}{'brier':>9}{'top1%':>8}{'top5%':>8}{'top10%':>8}")
    for name, m in r["models"].items():
        s = m.get("skill_vs_volume_baseline")
        print(f"{name:<48}{'' if s is None else f'{s:+.3f}':>8}{m.get('brier_any', ''):>9}"
              f"{m['capture_top_1pct']:>8.3f}{m['capture_top_5pct']:>8.3f}{m['capture_top_10pct']:>8.3f}")
    st = r["streak_test"]
    print(f"streak test: rho {st['mean_rho']:+.3f} (95% {st['ci95'][0]:+.3f} to {st['ci95'][1]:+.3f}, {st['weeks']} weeks)")
    print(f"spatial blocks: {r['spatial_blocked']}")
    print("top features:", list(r["feature_gain_share"].items())[:5])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synthetic", action="store_true", help="run the null world and the positive control")
    args = ap.parse_args()
    if args.synthetic:
        null = run(make_synthetic(hot=0.0), with_forecast=True)
        hot = run(make_synthetic(hot=0.6), with_forecast=True)
        # The pipeline must find recency when it exists and must not invent it when it does not.
        def gain(rep: dict, res: str) -> float:
            m = rep["by_resolution"][res]["models"]
            return m["GBT · volume + recency"]["skill_vs_volume_baseline"] - m["GBT · volume features only"]["skill_vs_volume_baseline"]

        for res in map(str, CONFIG["resolutions"]):
            g0, g1 = gain(null, res), gain(hot, res)
            print(f"\npositive control res {res}: recency gain null {g0:+.4f} · hot {g1:+.4f}")
            assert g1 > g0 + 0.01, "pipeline failed to detect a real streak signal"
        print("positive control passed")
    else:
        run(load_real(), with_forecast=False)


if __name__ == "__main__":
    main()
