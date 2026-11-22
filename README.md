# LeaveWise AI

An AI commute and event-traffic copilot. It tells you **when to leave**, **which day of the week is worst**, **why traffic is bad**, and (for organisers) **how an event will load nearby roads**, with plain-English explanations from an LLM.

Full stack: React (Vite) + Vercel serverless API + ML forecaster + LLM + optional MongoDB Atlas.

## What the app does

| Tab | What you get | AI used |
|---|---|---|
| Plan | "Leave by 8:06 AM" boarding-pass card, trip time vs departure time, bad-day range, fuel/CO₂/₹ cost of delay | LLM briefing; exact Shapley XAI + LLM explanation |
| Copilot | Chat: "I must reach the airport by 6 PM Friday, it may rain" | LLM intent extraction → forecast tools → LLM answer |
| Week | 7×24 congestion heat-map, best/worst day, work-from-home hint | LLM weekly briefing |
| Events | Crowd + closure → peak congestion, deployment plan, what-if (shuttles, later start) | LLM event brief + public advisory |
| Saved | Saved commutes (browser, or MongoDB if configured) and activity | – |
| About | Why it matters, model card, assumptions | – |

**AI vs ML.** AI = the LLM layer (understanding, tool use, explanation, briefs). ML = a gradient-boosting model that forecasts vehicles/hour. The LLM never invents numbers: every figure is computed by the model and passed to it as FACTS. If no API key is set, or the AI call fails, every feature falls back to template text and keeps working.

## Project layout

```
api/            Vercel serverless functions (one file = one route)
lib/            shared server code (model, traffic maths, events, LLM client, AI features)
lib/data/       model.generated.js  <- produced by ml/train.py, committed
ml/             Python: demo-data generator, training script, reports (metrics, charts)
src/            React app (views, charts, styles)
tests/          node:test suite (npm test)
scripts/        local dev server for /api
docs/           PITCH.md (how to explain the app), REPORT_NOTES.md
vercel.json  .env.example  package.json  vite.config.js
```

## Run locally

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY (free at aistudio.google.com/apikey); optional
npm run dev                 # app on http://localhost:5173, API on :3001
npm test                    # 26 tests: model parity with Python, XAI maths, planner, API, LLM fallback
```

## Model and data

The committed `lib/data/model.generated.js` was trained on the real **Metro Interstate Traffic Volume** dataset (hourly I-94 westbound, Minnesota, 2012-2018; UCI #492 / Kaggle). Metrics are in `ml/reports/metrics.json` and are shown on the About tab. The model is **not trained on Delhi data** and the app uses **no live traffic**: it forecasts typical patterns (hour, weekday, season, holiday, weather), not current conditions. Gradient Boosting only slightly beats the seasonal baseline (test MAE about 221 vs 231 vehicles/h), and the "80%" range covers about 75% of held-out hours, so treat both as approximate.

To retrain (optional; the CSV is git-ignored, so download it again first):

1. Save the CSV as `ml/data/Metro_Interstate_Traffic_Volume.csv`.
2. `python -m venv .venv && . .venv/bin/activate` (Windows: `.venv\Scripts\activate`)
3. `pip install -r ml/requirements.txt`
4. `python ml/train.py`
5. Commit the regenerated `lib/data/model.generated.js` and `ml/reports/*`, then run `npm test` (the parity test checks the JS model matches Python).

`python ml/make_demo_data.py` + `npm run train:demo` build a synthetic stand-in for offline testing only; the app then shows a "Demo model" banner.

Training uses a time-based split (test = most recent 15%), compares a seasonal baseline, Random Forest and Gradient Boosting, and exports the Gradient Boosting trees as plain JavaScript, so Vercel needs no Python.

## Deploy to GitHub + Vercel

1. `git init && git add . && git commit -m "LeaveWise AI" && git branch -M main`, create a GitHub repo, `git remote add origin ... && git push -u origin main`.
2. vercel.com → Add New → Project → import the repo. Framework is detected as Vite (settings come from `vercel.json`).
3. Project → Settings → Environment Variables: add `GEMINI_API_KEY` (and optionally `MONGODB_URI`). See `.env.example`.
4. Redeploy. Open `/api/health` on your site to confirm the model, AI and database status.

Never commit `.env`. If a MongoDB password was ever committed anywhere, rotate it in Atlas.

Notes: the AI rate limit is per serverless instance (best effort, not a hard quota). Saved commutes work without MongoDB (browser storage only); set `MONGODB_URI` to sync them.

## Assumptions you can tune

`lib/traffic.js`: delay formula constants (`ALPHA`, `BETA`), weather capacity factors, fuel burn, CO₂ per litre. `lib/events.js`: arrival/leave shares, closure capacity loss. All are shown on the About tab.
