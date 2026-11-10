"""Build processed Census outputs for ma-scratch-2026 from data/raw/census (throwaway script).
usage: python -I process.py <repo_root> <unzip_dir>"""
import sys, json, pathlib, zipfile
import numpy as np, pandas as pd, geopandas as gpd, shapely

ROOT = pathlib.Path(sys.argv[1]); RAW = ROOT / "data/raw/census"; OUT = ROOT / "data/processed"
X = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
for z in (RAW / "geo").glob("*.zip"):
    d = X / z.stem
    if not d.exists():
        zipfile.ZipFile(z).extractall(d)

VINTAGES = {2023: "2019-2023", 2024: "2020-2024"}
JAM = {-666666666: "not_computed", -999999999: "not_displayed", -888888888: "not_applicable",
       -222222222: "moe_not_computed", -333333333: "moe_open_ended", -555555555: "moe_controlled"}
TOP, BOTTOM = 250001, 2499  # B19013 open-ended interval codes ("250,000+", "2,500-")

def load(year, table, cols):
    df = pd.read_csv(RAW / f"acs/acsdt5y{year}-{table}.dat", sep="|", dtype=str, usecols=["GEO_ID", *cols])
    return df

def num(s):
    return pd.to_numeric(s, errors="coerce")

def build(prefix, year):
    inc = load(year, "b19013", ["B19013_E001", "B19013_M001"])
    hh = load(year, "b11001", ["B11001_E001", "B11001_M001"])
    pci = load(year, "b19301", ["B19301_E001", "B19301_M001"])
    df = inc.merge(hh, on="GEO_ID", how="outer").merge(pci, on="GEO_ID", how="outer")
    df = df[df.GEO_ID.str.startswith(prefix)].copy()
    df["geoid"] = df.GEO_ID.str.split("US").str[1]
    e, m = num(df.B19013_E001), num(df.B19013_M001)
    he, hm = num(df.B11001_E001), num(df.B11001_M001)
    flag = pd.Series("ok", index=df.index)
    flag[e.isna()] = "null"
    for code, name in JAM.items():
        flag[e == code] = name
    flag[e == TOP] = "topcoded_250000plus"
    flag[e == BOTTOM] = "bottomcoded_2500minus"
    moe_flag = pd.Series("", index=df.index)
    for code, name in JAM.items():
        moe_flag[m == code] = name
    clean_e = e.where((e >= 0))
    clean_m = m.where((m >= 0))
    clean_m[m == -555555555] = 0
    cv = (clean_m / 1.645) / clean_e
    rel = pd.Series("", index=df.index)
    rel[cv.notna()] = np.where(cv[cv.notna()] <= 0.15, "high", np.where(cv[cv.notna()] <= 0.30, "medium", "low"))
    out = pd.DataFrame({
        "geoid": df.geoid, "acs_release": VINTAGES[year], "acs_end_year": year,
        "dollar_year": year,
        "median_income": clean_e.astype("Int64"), "moe": clean_m.astype("Int64"),
        "households": he.where(he >= 0).astype("Int64"), "households_moe": hm.where(hm >= 0).astype("Int64"),
        "flag": flag, "moe_flag": moe_flag,
        "cv": cv.round(4), "reliability": rel,
        "median_income_raw": df.B19013_E001, "moe_raw": df.B19013_M001,
        "households_raw": df.B11001_E001, "households_moe_raw": df.B11001_M001,
    })
    ctx = pd.DataFrame({"geoid": df.geoid, "acs_release": VINTAGES[year], "dollar_year": year,
                        "per_capita_income": num(df.B19301_E001).where(num(df.B19301_E001) >= 0).astype("Int64"),
                        "per_capita_income_moe": num(df.B19301_M001).where(num(df.B19301_M001) >= 0).astype("Int64"),
                        "per_capita_income_raw": df.B19301_E001, "per_capita_income_moe_raw": df.B19301_M001})
    return out.sort_values("geoid"), ctx.sort_values("geoid")

tract_inc, tract_ctx, town_inc = [], [], []
for y in VINTAGES:
    a, b = build("1400000US25", y); tract_inc.append(a); tract_ctx.append(b)
    c, _ = build("0600000US25", y); town_inc.append(c)
tract_inc = pd.concat(tract_inc); tract_ctx = pd.concat(tract_ctx); town_inc = pd.concat(town_inc)

# ---- crosswalk: 2020 blocks -> MCD (BAF) weighted by 2020 block POP20/HOUSING20 (TIGER tabblock20)
baf = pd.read_csv(X / "BlockAssign_ST25_MA/BlockAssign_ST25_MA_MCD.txt", sep="|", dtype=str)
blk = gpd.read_file(X / "tl_2020_25_tabblock20/tl_2020_25_tabblock20.shp", ignore_geometry=True,
                    columns=["GEOID20", "POP20", "HOUSING20", "ALAND20"])
assert len(baf) == len(blk) == baf.BLOCKID.nunique()
b = baf.merge(blk, left_on="BLOCKID", right_on="GEOID20", how="outer", indicator=True)
assert (b._merge == "both").all(), b._merge.value_counts()
b["tract_geoid"] = b.BLOCKID.str[:11]
b["town_geoid"] = "25" + b.COUNTYFP + b.COUSUBFP
for c in ("POP20", "HOUSING20", "ALAND20"):
    b[c] = b[c].astype("int64")
cw = b.groupby(["tract_geoid", "town_geoid"], as_index=False).agg(
    pop20=("POP20", "sum"), hu20=("HOUSING20", "sum"), aland20=("ALAND20", "sum"), blocks=("BLOCKID", "size"))
tot = cw.groupby("tract_geoid")[["pop20", "hu20", "aland20", "blocks"]].transform("sum")
cw["pop_share"] = (cw.pop20 / tot.pop20.replace(0, np.nan)).round(4)
cw["hu_share"] = (cw.hu20 / tot.hu20.replace(0, np.nan)).round(4)
cw["aland_share"] = (cw.aland20 / tot.aland20.replace(0, np.nan)).round(4)
cw["n_towns"] = cw.groupby("tract_geoid").town_geoid.transform("size")
cw["is_water_cousub"] = cw.town_geoid.str.endswith("00000")
cw["n_towns_land"] = cw.assign(x=~cw.is_water_cousub).groupby("tract_geoid").x.transform("sum")
cw["n_towns_populated"] = cw.assign(x=cw.pop20 > 0).groupby("tract_geoid").x.transform("sum")
cw = cw.sort_values(["tract_geoid", "pop20", "hu20", "aland20", "blocks"], ascending=[True, False, False, False, False])
cw["is_primary"] = ~cw.duplicated("tract_geoid")
cw["primary_basis"] = np.where(tot.loc[cw.index, "pop20"] > 0, "pop20",
                       np.where(tot.loc[cw.index, "hu20"] > 0, "hu20",
                       np.where(tot.loc[cw.index, "aland20"] > 0, "aland20", "block_count")))

towns = gpd.read_file(X / "cb_2024_25_cousub_500k/cb_2024_25_cousub_500k.shp")
towns23 = gpd.read_file(X / "cb_2023_25_cousub_500k/cb_2023_25_cousub_500k.shp")
CODE_MAP = {}
for _, r in towns23[~towns23.GEOID.isin(towns.GEOID)].iterrows():
    base = r.NAME.removesuffix(" Town")
    m = towns[(towns.COUNTYFP == r.COUNTYFP) & (towns.NAME == base)]
    assert len(m) == 1, r.NAME
    a = gpd.GeoSeries([r.geometry], crs=towns23.crs).to_crs(26986).iloc[0]
    bgeom = m.to_crs(26986).geometry.iloc[0]
    iou = a.intersection(bgeom).area / a.union(bgeom).area
    assert iou > 0.99, (r.NAME, iou)
    CODE_MAP[r.GEOID] = (m.GEOID.iloc[0], r.NAMELSAD, m.NAMELSAD.iloc[0], round(iou, 5))
b["town_geoid_2020"] = b.town_geoid
b["town_geoid"] = b.town_geoid.map(lambda g: CODE_MAP.get(g, (g,))[0])
cw = b.groupby(["tract_geoid", "town_geoid"], as_index=False).agg(
    pop20=("POP20", "sum"), hu20=("HOUSING20", "sum"), aland20=("ALAND20", "sum"), blocks=("BLOCKID", "size"))
tot = cw.groupby("tract_geoid")[["pop20", "hu20", "aland20", "blocks"]].transform("sum")
cw["pop_share"] = (cw.pop20 / tot.pop20.replace(0, np.nan)).round(4)
cw["hu_share"] = (cw.hu20 / tot.hu20.replace(0, np.nan)).round(4)
cw["aland_share"] = (cw.aland20 / tot.aland20.replace(0, np.nan)).round(4)
cw["n_towns"] = cw.groupby("tract_geoid").town_geoid.transform("size")
cw["is_water_cousub"] = cw.town_geoid.str.endswith("00000")
cw["n_towns_land"] = cw.assign(x=~cw.is_water_cousub).groupby("tract_geoid").x.transform("sum")
cw["n_towns_populated"] = cw.assign(x=cw.pop20 > 0).groupby("tract_geoid").x.transform("sum")
cw = cw.sort_values(["tract_geoid", "pop20", "hu20", "aland20", "blocks"], ascending=[True, False, False, False, False])
cw["is_primary"] = ~cw.duplicated("tract_geoid")
cw["primary_basis"] = np.where(tot.loc[cw.index, "pop20"] > 0, "pop20",
                       np.where(tot.loc[cw.index, "hu20"] > 0, "hu20",
                       np.where(tot.loc[cw.index, "aland20"] > 0, "aland20", "block_count")))
town_inc["geoid_2024"] = town_inc.geoid.map(lambda g: CODE_MAP.get(g, (g,))[0])
town_inc["no_cousub_water"] = town_inc.geoid.str.endswith("00000")
tname = towns.set_index("GEOID")[["NAME", "NAMELSAD"]]
cw["town_name"] = cw.town_geoid.map(tname.NAME)
cw["town_namelsad"] = cw.town_geoid.map(tname.NAMELSAD)
cw.loc[cw.town_geoid.str.endswith("00000"), "town_name"] = "(no county subdivision: water)"

# ---- tracts
tr = gpd.read_file(X / "cb_2024_25_tract_500k/cb_2024_25_tract_500k.shp")
tr23 = gpd.read_file(X / "cb_2023_25_tract_500k/cb_2023_25_tract_500k.shp")
proj = tr.to_crs(26986)  # NAD83 / Massachusetts Mainland (meters)
cent = proj.geometry.centroid
cent_ll = gpd.GeoSeries(cent, crs=26986).to_crs(4326)
tr["centroid_lon"] = cent_ll.x.round(6); tr["centroid_lat"] = cent_ll.y.round(6)
tr["centroid_inside"] = cent.within(proj.geometry).values
ip = gpd.GeoSeries(proj.geometry.representative_point(), crs=26986).to_crs(4326)
tr["inner_lon"] = ip.x.round(6); tr["inner_lat"] = ip.y.round(6)
prim = cw[cw.is_primary].set_index("tract_geoid")
tr["town_geoid"] = tr.GEOID.map(prim.town_geoid)
tr["town"] = tr.GEOID.map(prim.town_name)
tr["town_pop_share"] = tr.GEOID.map(prim.pop_share)
tr["n_towns"] = tr.GEOID.map(prim.n_towns_land)
tr["county"] = tr.NAMELSADCO
tr = tr.to_crs(4326)

def write_geojson(gdf, path, keep, tol_m):
    g = gdf[keep + ["geometry"]].copy()
    if tol_m:
        gp = g.to_crs(26986)
        gp["geometry"] = shapely.coverage_simplify(gp.geometry.values, tolerance=tol_m, simplify_boundary=True)
        g = gp.to_crs(4326)
    g["geometry"] = shapely.set_precision(g.geometry.values, 1e-5)
    g = g.copy()
    g["geometry"] = g.geometry.make_valid()
    path.unlink(missing_ok=True)
    g.to_file(path, driver="GeoJSON", COORDINATE_PRECISION=5, RFC7946="YES", WRITE_NAME="NO")
    return g

keep_tr = ["GEOID", "NAME", "NAMELSAD", "COUNTYFP", "county", "town", "town_geoid", "town_pop_share", "n_towns",
           "ALAND", "AWATER", "centroid_lon", "centroid_lat", "centroid_inside", "inner_lon", "inner_lat"]
TOL = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
gt = write_geojson(tr, OUT / "tracts_ma.geojson", keep_tr, TOL)
towns["county"] = towns.NAMELSADCO
tw = towns.to_crs(4326)
tc = towns.to_crs(26986).geometry.centroid
tcl = gpd.GeoSeries(tc, crs=26986).to_crs(4326)
tw["centroid_lon"] = tcl.x.round(6); tw["centroid_lat"] = tcl.y.round(6)
tw["n_tracts_primary"] = tw.GEOID.map(prim.reset_index().groupby("town_geoid").size()).fillna(0).astype(int)
gw = write_geojson(tw, OUT / "towns_ma.geojson",
                   ["GEOID", "NAME", "NAMELSAD", "LSAD", "COUNTYFP", "county", "ALAND", "AWATER",
                    "centroid_lon", "centroid_lat", "n_tracts_primary"], TOL)

tract_inc.to_csv(OUT / "tract_income.csv", index=False)
tract_ctx.to_csv(OUT / "tract_income_context.csv", index=False)
town_inc[["geoid", "geoid_2024", "no_cousub_water"] + [c for c in town_inc.columns if c not in ("geoid", "geoid_2024", "no_cousub_water")]].to_csv(OUT / "town_income.csv", index=False)
cw_cols = ["tract_geoid", "town_geoid", "town_name", "town_namelsad", "pop20", "hu20", "aland20", "blocks",
           "pop_share", "hu_share", "aland_share", "n_towns", "n_towns_land", "n_towns_populated", "is_water_cousub", "is_primary", "primary_basis"]
cw[cw_cols].to_csv(OUT / "tract_town_crosswalk.csv", index=False)

# ---- verification
rep = {}
rep["cb2024_tracts"] = len(tr); rep["cb2023_tracts"] = len(tr23)
rep["cb2023_vs_2024_geoid_equal"] = set(tr.GEOID) == set(tr23.GEOID)
rep["baf_tracts"] = b.tract_geoid.nunique(); rep["baf_towns"] = b.town_geoid.nunique()
rep["cb_towns"] = len(towns)
rep["baf_town_codes_not_in_cb"] = sorted(set(b.town_geoid) - set(towns.GEOID))
rep["cb_towns_not_in_baf"] = sorted(set(towns.GEOID) - set(b.town_geoid))
polys = set(tr.GEOID)
for y, lab in VINTAGES.items():
    t = tract_inc[tract_inc.acs_release == lab]
    r = {"rows": len(t), "flags": t.flag.value_counts().to_dict(), "moe_flags": t.moe_flag.value_counts().to_dict(),
         "reliability": t.reliability.value_counts().to_dict()}
    ok = t[t.flag.isin(["ok"]) & t.moe.notna()]
    r["median_moe_pct_of_estimate"] = round(float((ok.moe / ok.median_income * 100).median()), 2)
    r["p90_moe_pct"] = round(float((ok.moe / ok.median_income * 100).quantile(0.9)), 2)
    r["median_of_tract_medians"] = int(ok.median_income.median())
    nj = sorted(set(t.geoid) - polys)
    r["non_joins"] = {g: t.set_index("geoid").loc[g, ["flag", "households_raw"]].tolist() for g in nj}
    r["polygons_without_income"] = sorted(polys - set(t.geoid))
    r["zero_households"] = int((t.households == 0).sum())
    r["households_flags"] = {k: int(v) for k, v in t.households_raw.astype(int).lt(0).value_counts().items()}
    rep[lab] = r
    tw_ = town_inc[town_inc.acs_release == lab]
    rep[lab + "_towns"] = {"rows": len(tw_), "flags": tw_.flag.value_counts().to_dict(),
                           "non_joins": sorted(set(tw_.geoid) - set(towns.GEOID))}
both = tract_inc.pivot(index="geoid", columns="acs_release", values="flag")
rep["geoid_sets_equal_across_vintages"] = set(tract_inc[tract_inc.acs_release == "2019-2023"].geoid) == set(tract_inc[tract_inc.acs_release == "2020-2024"].geoid)
rep["tracts_touching_water_cousub"] = int(cw.groupby("tract_geoid").is_water_cousub.any().sum())
rep["split_tracts_any"] = int(cw[cw.is_primary].n_towns.gt(1).sum())
rep["split_tracts_land"] = int(cw[cw.is_primary].n_towns_land.gt(1).sum())
rep["split_tracts_populated"] = int(cw[cw.is_primary].n_towns_populated.gt(1).sum())
rep["max_towns_per_tract_land"] = int(cw.n_towns_land.max())
sp = cw[cw.is_primary & cw.n_towns_populated.gt(1)]
rep["split_populated_detail"] = sp[["tract_geoid", "town_name", "pop_share", "n_towns_populated"]].values.tolist()
rep["pop_outside_primary_town"] = int(cw[~cw.is_primary].pop20.sum())
rep["split_tracts_primary_share_lt_0.9"] = int((sp.pop_share < 0.9).sum())
rep["split_tracts_primary_share_lt_0.5"] = sp[sp.pop_share < 0.5][["tract_geoid", "town_name", "pop_share"]].values.tolist()
rep["centroid_outside_polygon"] = sorted(tr.loc[~tr.centroid_inside, "GEOID"].tolist())
rep["tracts_without_town"] = sorted(tr.loc[tr.town.isna(), "GEOID"].tolist())
rep["simplify_tolerance_m"] = TOL
rep["cousub_code_map_2020_2023_to_2024"] = CODE_MAP
tl = gpd.read_file(X / "tl_2024_25_tract/tl_2024_25_tract.shp", ignore_geometry=True)
rep["tiger2024_tracts"] = len(tl); rep["tiger_vs_acs_geoid_equal"] = set(tl.GEOID) == set(tract_inc.geoid)
rep["tiger_not_in_cb"] = sorted(set(tl.GEOID) - polys)
rep["tiger_not_in_cb_aland"] = tl[tl.GEOID.isin(set(tl.GEOID) - polys)][["GEOID", "ALAND", "AWATER"]].values.tolist()
rep["town_income_non_joins_after_map"] = {lab: sorted(set(town_inc[town_inc.acs_release == lab].geoid_2024) - set(towns.GEOID)) for lab in VINTAGES.values()}
rep["cb_towns_missing_income"] = {lab: sorted(set(towns.GEOID) - set(town_inc[town_inc.acs_release == lab].geoid_2024)) for lab in VINTAGES.values()}
rep["crosswalk_pop_total"] = int(cw.pop20.sum()); rep["crosswalk_rows"] = len(cw)
rep["invalid_out_tracts"] = int((~gt.is_valid).sum()); rep["invalid_out_towns"] = int((~gw.is_valid).sum())
rep["files_bytes"] = {p.name: p.stat().st_size for p in sorted(OUT.glob("*"))}
print(json.dumps(rep, indent=1, default=str))
(X.parent / "verify_report.json").write_text(json.dumps(rep, indent=1, default=str))
