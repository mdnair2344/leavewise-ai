"""
Generate a SYNTHETIC stand-in for the Kaggle / UCI "Metro Interstate Traffic Volume" CSV.

WHY THIS EXISTS
  It has exactly the same columns as the real file, so the whole pipeline
  (cleaning -> training -> export -> API) can be tested without the real download.
  Models trained on this file are marked source="synthetic-demo" and the app shows a banner.

  >>> For your project/report, train on the REAL Kaggle CSV instead (see README). <<<

Usage:  python ml/make_demo_data.py            -> ml/data/synthetic_demo_traffic.csv
"""
import numpy as np
import pandas as pd
from pathlib import Path

rng = np.random.default_rng(42)
OUT = Path(__file__).parent / "data" / "synthetic_demo_traffic.csv"

# Typical hourly volume shape for a commuter interstate (vehicles / hour)
WEEKDAY = [420, 280, 230, 310, 820, 2900, 5100, 6100, 5500, 4700, 4300, 4500,
           4800, 4900, 5300, 5900, 6400, 6200, 4700, 3400, 2600, 2000, 1500, 900]
WEEKEND = [1000, 700, 520, 380, 420, 700, 1100, 1700, 2500, 3300, 3900, 4200,
           4400, 4500, 4400, 4300, 4200, 3900, 3300, 2700, 2200, 1800, 1400, 1100]

idx = pd.date_range("2016-01-01", "2018-09-30 23:00", freq="h")
df = pd.DataFrame({"date_time": idx})
df["hour"] = df.date_time.dt.hour
df["dow"] = df.date_time.dt.dayofweek
df["month"] = df.date_time.dt.month
df["date"] = df.date_time.dt.date

# --- US-style holidays (label only on first hour of the day, like the real file)
def nth_weekday(year, month, weekday, n):
    d = pd.Timestamp(year, month, 1)
    d += pd.Timedelta(days=(weekday - d.weekday()) % 7 + 7 * (n - 1))
    return d

def last_weekday(year, month, weekday):
    d = pd.Timestamp(year, month, 1) + pd.offsets.MonthEnd(0)
    return d - pd.Timedelta(days=(d.weekday() - weekday) % 7)

hol = {}
for y in (2016, 2017, 2018):
    hol[pd.Timestamp(y, 1, 1)] = "New Years Day"
    hol[nth_weekday(y, 1, 0, 3)] = "Martin Luther King Jr Day"
    hol[nth_weekday(y, 2, 0, 3)] = "Washingtons Birthday"
    hol[last_weekday(y, 5, 0)] = "Memorial Day"
    hol[pd.Timestamp(y, 7, 4)] = "Independence Day"
    hol[nth_weekday(y, 9, 0, 1)] = "Labor Day"
    hol[nth_weekday(y, 10, 0, 2)] = "Columbus Day"
    hol[pd.Timestamp(y, 11, 11)] = "Veterans Day"
    hol[nth_weekday(y, 11, 3, 4)] = "Thanksgiving Day"
    hol[pd.Timestamp(y, 12, 25)] = "Christmas Day"
    hol[pd.Timestamp(y, 8, 26)] = "State Fair"
df["holiday_flag"] = df.date_time.dt.normalize().map(lambda d: d in hol)

# --- weather: one state per ~6h block, seasonal
month_temp_c = {1: -9, 2: -6, 3: 1, 4: 9, 5: 16, 6: 21, 7: 24, 8: 22, 9: 17, 10: 9, 11: 1, 12: -6}
blocks = (df.date_time - df.date_time.min()).dt.total_seconds() // (6 * 3600)
states = {}
for b in np.unique(blocks):
    m = df.loc[blocks == b, "month"].iloc[0]
    cold = m in (12, 1, 2, 3)
    p = rng.random()
    if cold:
        s = "Snow" if p < .18 else "Clouds" if p < .55 else "Clear" if p < .85 else "Mist"
    else:
        s = "Rain" if p < .16 else "Clouds" if p < .50 else "Clear" if p < .88 else "Mist"
    states[b] = s
df["weather_main"] = blocks.map(states)
day_noise = df.groupby("date").ngroup().map(dict(enumerate(rng.normal(0, 4, df["date"].nunique()))))
df["temp_c"] = df.month.map(month_temp_c) + day_noise + 4 * np.sin((df.hour - 9) / 24 * 2 * np.pi)
df["temp"] = (df.temp_c + 273.15).round(2)
df["rain_1h"] = np.where(df.weather_main == "Rain", np.round(rng.gamma(1.2, 1.2, len(df)), 2), 0.0)
df["snow_1h"] = np.where(df.weather_main == "Snow", np.round(rng.gamma(1.5, .08, len(df)), 2), 0.0)
df["clouds_all"] = df.weather_main.map({"Clear": 5, "Clouds": 80, "Rain": 90, "Snow": 92, "Mist": 90}).astype(int)
df["weather_description"] = df.weather_main.str.lower()

# --- volume
base = np.where(df.dow >= 5, np.array(WEEKEND)[df.hour], np.array(WEEKDAY)[df.hour]).astype(float)
season = 1 + 0.06 * np.sin((df.month - 4) / 12 * 2 * np.pi)
holiday_f = np.where(df.holiday_flag, 0.55, 1.0)
fair_f = np.where(df.date_time.dt.normalize().map(lambda d: hol.get(d) == "State Fair"), 1.15, 1.0)
wx = np.select([df.weather_main == "Snow", df.weather_main == "Rain", df.weather_main == "Mist"], [0.88, 0.95, 0.97], 1.0)
wx = wx * np.where(df.rain_1h > 4, 0.92, 1.0)
noise = rng.lognormal(0, 0.07, len(df))
df["traffic_volume"] = np.clip(base * season * holiday_f * fair_f * wx * noise, 20, 7300).round().astype(int)

df["holiday"] = "None"
first = df.groupby("date").head(1).index
df.loc[first, "holiday"] = df.loc[first, "date_time"].dt.normalize().map(lambda d: hol.get(d, "None"))

out = df[["holiday", "temp", "rain_1h", "snow_1h", "clouds_all", "weather_main",
          "weather_description", "date_time", "traffic_volume"]].copy()
# mimic quirks of the real file: a few duplicate rows
dups = out.sample(300, random_state=1)
out = pd.concat([out, dups]).sort_values("date_time", kind="stable")
OUT.parent.mkdir(parents=True, exist_ok=True)
out.to_csv(OUT, index=False)
print(f"wrote {OUT}  rows={len(out)}  (SYNTHETIC - not real traffic data)")
