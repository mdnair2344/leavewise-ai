# Notes for the new report

- Dataset: Metro Interstate Traffic Volume (UCI #492, Hogue 2019; Kaggle mirrors). Hourly I-94 westbound volume + weather + holiday, 2012-2018. Cite UCI: https://doi.org/10.24432/C5X60B
- Cleaning steps (ml/train.py): drop duplicate timestamps, remove temp=0 K glitches, cap rain outlier, spread the holiday label (only on the first hour in raw data) across the whole day.
- Features: hour, weekday, month, holiday, temp, rain, snow, clouds, weather group.
- Evaluation: time-based split; baseline vs Random Forest vs Gradient Boosting; numbers in `ml/reports/metrics.json` (only after training on the REAL csv). Charts in `ml/reports/*.png`.
- XAI: exact interventional Shapley values over 5 feature groups (lib/model.js), efficiency property tested.
- Travel time: BPR-style `t = t0 (1 + 0.8 (v/c)^3)`; capacity c = 98th percentile of historical volume; weather scales c.
- Event model: arrivals 50/30/20% in the 3 hours before start, departures 50/30/20% after end; car share and occupancy are inputs.
- Architecture diagram: Browser (React) → Vercel functions (/api) → [JS tree model, Shapley, planner] + [LLM provider] + [MongoDB optional].
