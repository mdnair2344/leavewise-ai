"""
Train the traffic-volume forecaster and export it for the Vercel API.

  python ml/train.py --csv ml/data/Metro_Interstate_Traffic_Volume.csv      # REAL Kaggle/UCI data
  python ml/train.py --csv ml/data/synthetic_demo_traffic.csv --source synthetic-demo   # pipeline test only

What it does
  1. Loads the CSV (Kaggle "Metro Interstate Traffic Volume": hourly I-94 westbound volume + weather + holiday)
  2. Cleans it (duplicates, sensor glitches, holiday label spread to the whole day)
  3. Builds features, does a TIME-BASED split (train on past, test on the most recent 15%)
  4. Compares: seasonal-naive baseline, Random Forest, Gradient Boosting
  5. Refits Gradient Boosting on all data and EXPORTS it as plain JS (lib/data/model.generated.js)
     so the Vercel serverless API can run it with zero Python / zero native dependencies.
  6. Writes metrics + charts to ml/reports/ (use these in your report)
"""
import argparse, json, time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ["hour", "dow", "month", "is_holiday", "temp_c", "rain_mm", "snow_mm", "clouds",
            "w_clouds", "w_rain", "w_snow", "w_fog"]
# Feature groups used for the Shapley explanation shown in the app (indices into FEATURES)
GROUPS = {"time_of_day": [0], "day_of_week": [1], "season": [2, 4], "weather": [5, 6, 7, 8, 9, 10, 11], "holiday": [3]}
WEATHER_MAP = {"Clouds": "w_clouds", "Rain": "w_rain", "Drizzle": "w_rain", "Thunderstorm": "w_rain",
               "Squall": "w_rain", "Snow": "w_snow", "Mist": "w_fog", "Fog": "w_fog", "Haze": "w_fog", "Smoke": "w_fog"}


def load_and_clean(csv_path):
    df = pd.read_csv(csv_path)
    need = {"holiday", "temp", "rain_1h", "snow_1h", "clouds_all", "weather_main", "date_time", "traffic_volume"}
    missing = need - set(df.columns)
    if missing:
        raise SystemExit(f"CSV is missing columns: {sorted(missing)}. Expected the Metro Interstate Traffic Volume schema.")
    n0 = len(df)
    df["date_time"] = pd.to_datetime(df["date_time"], errors="coerce")
    df = df.dropna(subset=["date_time", "traffic_volume"])
    df = df.sort_values("date_time", kind="stable")
    df = df.drop_duplicates(subset="date_time", keep="first")          # real file has ~7k duplicated timestamps
    df = df[df["temp"] > 200]                                           # real file has a few temp=0 K glitches
    df["rain_1h"] = df["rain_1h"].clip(upper=100)                       # real file has one 9831 mm outlier
    n1 = len(df)

    df["date"] = df["date_time"].dt.normalize()
    # In the raw data the holiday name appears only on the first hour of that day -> spread to all 24 hours
    hol_dates = set(df.loc[df["holiday"].fillna("None").astype(str).str.lower() != "none", "date"])
    df["is_holiday"] = df["date"].isin(hol_dates).astype(int)

    df["hour"] = df["date_time"].dt.hour
    df["dow"] = df["date_time"].dt.dayofweek
    df["month"] = df["date_time"].dt.month
    df["temp_c"] = (df["temp"] - 273.15).round(2)
    df["rain_mm"] = df["rain_1h"]
    df["snow_mm"] = df["snow_1h"]
    df["clouds"] = df["clouds_all"]
    for col in ("w_clouds", "w_rain", "w_snow", "w_fog"):
        df[col] = 0
    for raw, col in WEATHER_MAP.items():
        df.loc[df["weather_main"] == raw, col] = 1
    df = df.rename(columns={"traffic_volume": "y"})
    print(f"rows: raw={n0}  after cleaning={n1}  holidays(days)={len(hol_dates)}  "
          f"range={df['date_time'].min()} -> {df['date_time'].max()}")
    return df


def metrics(y, p):
    return {"mae": round(float(mean_absolute_error(y, p)), 1),
            "rmse": round(float(np.sqrt(mean_squared_error(y, p))), 1),
            "r2": round(float(r2_score(y, p)), 4)}


def export_tree(est):
    t = est.tree_
    leaf = t.children_left == -1
    return {
        "f": [int(-1 if l else f) for f, l in zip(t.feature, leaf)],
        "t": [round(float(x), 4) for x in t.threshold],
        "l": [int(x) for x in t.children_left],
        "r": [int(x) for x in t.children_right],
        "v": [round(float(v[0][0]), 3) if l else 0 for v, l in zip(t.value, leaf)],
    }


def py_predict(trees, offset, lr, X):
    out = np.full(len(X), offset, dtype=float)
    for tr in trees:
        for i, x in enumerate(X):
            n = 0
            while tr["f"][n] != -1:
                n = tr["l"][n] if x[tr["f"][n]] <= tr["t"][n] else tr["r"][n]
            out[i] += lr * tr["v"][n]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "ml/data/Metro_Interstate_Traffic_Volume.csv"))
    ap.add_argument("--source", default=None, help="label stored in the model card; defaults from file name")
    ap.add_argument("--trees", type=int, default=300)
    args = ap.parse_args()

    csv = Path(args.csv)
    if not csv.exists():
        raise SystemExit(f"CSV not found: {csv}\nDownload the Kaggle 'Metro Interstate Traffic Volume' CSV into ml/data/ "
                         f"(see README) or run `python ml/make_demo_data.py` for a synthetic stand-in.")
    synthetic = "synthetic" in csv.name.lower()
    source = args.source or ("synthetic-demo" if synthetic else "kaggle-metro-interstate-traffic-volume")

    df = load_and_clean(csv)
    X, y = df[FEATURES].astype(float).values, df["y"].values.astype(float)

    # ---- time-based split (no leakage from the future)
    cut = df["date_time"].quantile(0.85)
    tr, te = (df["date_time"] <= cut).values, (df["date_time"] > cut).values
    print(f"train rows={tr.sum()}  test rows={te.sum()}  (test = most recent 15% of time)")

    # ---- baseline: median volume for the same (weekday, hour, holiday?)
    key = df["dow"].astype(str) + "_" + df["hour"].astype(str) + "_" + df["is_holiday"].astype(str)
    med = df[tr].groupby(key[tr])["y"].median()
    base_pred = key[te].map(med).fillna(df[tr]["y"].median()).values
    results = {"seasonal_naive_baseline": metrics(y[te], base_pred)}

    t0 = time.time()
    rf = RandomForestRegressor(n_estimators=150, min_samples_leaf=3, n_jobs=-1, random_state=0).fit(X[tr], y[tr])
    results["random_forest"] = metrics(y[te], rf.predict(X[te]))
    gbr_params = dict(n_estimators=args.trees, max_depth=5, learning_rate=0.06, subsample=0.8,
                      min_samples_leaf=20, random_state=0)
    gbr = GradientBoostingRegressor(**gbr_params).fit(X[tr], y[tr])
    pred_te = gbr.predict(X[te])
    results["gradient_boosting"] = metrics(y[te], pred_te)
    print(f"fit time {time.time()-t0:.1f}s")
    for k, v in results.items():
        print(f"  {k:26s} MAE={v['mae']:8.1f}  RMSE={v['rmse']:8.1f}  R2={v['r2']:.4f}")

    # ---- prediction intervals: multiplicative residual quantiles by predicted-volume bucket
    ratio = y[te] / np.maximum(pred_te, 1)
    edges = [0, 1500, 3500, 5000, 1e9]
    unc = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (pred_te >= lo) & (pred_te < hi)
        r = ratio[m] if m.sum() > 30 else ratio
        unc.append({"max": hi if hi < 1e8 else 1e9, "lo": round(float(np.quantile(r, .10)), 3),
                    "hi": round(float(np.quantile(r, .90)), 3)})
    inside = float(np.mean((ratio >= np.interp(pred_te, [0, 1500, 3500, 5000, 9e9], [u["lo"] for u in unc] + [unc[-1]["lo"]]))
                           & (ratio <= np.interp(pred_te, [0, 1500, 3500, 5000, 9e9], [u["hi"] for u in unc] + [unc[-1]["hi"]]))))
    results["interval_80_coverage_on_test"] = round(inside, 3)

    # ---- final model on ALL data (same hyper-parameters)
    final = GradientBoostingRegressor(**gbr_params).fit(X, y)
    trees = [export_tree(e[0]) for e in final.estimators_]
    offset = float(final.init_.constant_[0][0])
    lr = float(final.learning_rate)

    # sanity: our own tree walker must reproduce sklearn exactly
    rng = np.random.default_rng(0)
    pick = rng.choice(len(X), 400, replace=False)
    mine = py_predict(trees, offset, lr, X[pick])
    err = float(np.max(np.abs(mine - final.predict(X[pick]))))
    assert err < 0.5, f"exported tree walker deviates from sklearn by {err}"
    print(f"export check: max |walker - sklearn| = {err:.4f} veh/h")

    # ---- model card data
    bg = df.sample(64, random_state=1)[FEATURES].astype(float).round(2).values.tolist()
    prof = df.assign(wk=np.where(df["dow"] >= 5, "weekend", "weekday")).groupby(["wk", "hour"])["y"].mean().round(0)
    profile = {wk: [float(prof[(wk, h)]) for h in range(24)] for wk in ("weekday", "weekend")}
    meta = {
        "name": "LeaveWise traffic-volume forecaster", "type": "GradientBoostingRegressor (exported to JS)",
        "source": source, "is_synthetic": bool(synthetic),
        "dataset": "Metro Interstate Traffic Volume (UCI #492 / Kaggle mirrors): hourly I-94 westbound, MN, 2012-2018" if not synthetic
                   else "SYNTHETIC stand-in with the same schema (for pipeline testing only)",
        "rows_used": int(len(df)), "date_from": str(df["date_time"].min()), "date_to": str(df["date_time"].max()),
        "trained_at": time.strftime("%Y-%m-%d %H:%M"), "sklearn": sklearn.__version__,
        "hyperparameters": gbr_params, "split": "time-based, test = most recent 15%",
        "metrics": results,
        "capacity": int(np.quantile(y, 0.98)),
        "features": FEATURES, "groups": GROUPS, "background": bg, "uncertainty": unc, "profile": profile,
        "importances": {f: round(float(v), 4) for f, v in zip(FEATURES, final.feature_importances_)},
    }
    model = {"meta": meta, "offset": offset, "lr": lr, "trees": trees}

    out_js = ROOT / "lib/data/model.generated.js"
    out_js.parent.mkdir(parents=True, exist_ok=True)
    out_js.write_text("// AUTO-GENERATED by ml/train.py - do not edit by hand.\nexport default "
                      + json.dumps(model, separators=(",", ":")) + ";\n")
    print(f"wrote {out_js}  ({out_js.stat().st_size/1024:.0f} KB)")

    rep = ROOT / "ml/reports"
    rep.mkdir(exist_ok=True)
    (rep / "metrics.json").write_text(json.dumps({k: v for k, v in meta.items() if k not in ("background", "profile")}, indent=2))
    gold = [{"x": X[i].tolist(), "pred": round(float(final.predict(X[i:i+1])[0]), 2)} for i in pick[:25]]
    (rep / "golden.json").write_text(json.dumps(gold))   # used by tests/ to prove JS == Python

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        d = df[te].assign(pred=pred_te).iloc[:24 * 7]
        fig, ax = plt.subplots(figsize=(10, 3.2))
        ax.plot(d["date_time"], d["y"], label="actual", lw=1.2); ax.plot(d["date_time"], d["pred"], label="predicted", lw=1.2)
        ax.set_title("Actual vs predicted traffic volume (first test week)"); ax.set_ylabel("vehicles / hour"); ax.legend()
        fig.tight_layout(); fig.savefig(rep / "actual_vs_predicted.png", dpi=140); plt.close(fig)
        fig, ax = plt.subplots(figsize=(6, 3.4))
        imp = sorted(meta["importances"].items(), key=lambda kv: kv[1])
        ax.barh([k for k, _ in imp], [v for _, v in imp]); ax.set_title("Feature importance (global)")
        fig.tight_layout(); fig.savefig(rep / "feature_importance.png", dpi=140); plt.close(fig)
        fig, ax = plt.subplots(figsize=(7, 3.2))
        ax.plot(range(24), profile["weekday"], label="weekday"); ax.plot(range(24), profile["weekend"], label="weekend")
        ax.set_title("Average hourly volume"); ax.set_xlabel("hour"); ax.legend(); fig.tight_layout()
        fig.savefig(rep / "hourly_profile.png", dpi=140); plt.close(fig)
        print("charts written to ml/reports/")
    except Exception as e:  # charts are optional
        print("skipped charts:", e)

    if synthetic:
        print("\n*** NOTE: trained on SYNTHETIC data. Do not quote these numbers in your report. ***")


if __name__ == "__main__":
    main()
