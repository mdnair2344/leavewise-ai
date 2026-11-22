# How to explain LeaveWise AI (viva / demo)

**One line:** "Maps shows traffic now. LeaveWise tells you when to leave tomorrow, which day this week to avoid, and why, using forecasts and an AI assistant you can talk to."

## Why it is essential in daily life
1. Everyone who commutes decides *when to leave* every day. Small shifts change trip time a lot (Plan tab shows the curve).
2. Delay is money and pollution: the app converts lost minutes into litres, CO₂ and rupees.
3. Weekly planning: the Week tab shows the hardest day so you can work from home or shift hours.
4. Events (matches, concerts, processions) break normal patterns: organisers and city staff get impact, deployment and a public advisory in seconds.
5. Trust: Explainable AI shows *which factors* push traffic up or down (exact Shapley values), then the LLM says it in plain words.

## Where AI is used (be precise)
- Intent extraction: LLM turns free text into validated slots (date, deadline, weather).
- Tool use: the server runs the forecast; the LLM only narrates the returned facts (no invented numbers).
- XAI narration, weekly briefing, event brief, public advisory.
- Guardrails: JSON validation, untrusted text fenced, rate limit, template fallback.

## Where ML is used
Gradient-boosted trees forecast vehicles/hour from hour, weekday, month, holiday, temperature, rain/snow/clouds. Time-based train/test split, baseline comparison, 80% prediction interval (measured coverage on the held-out test set is about 75%, so call it approximate).

## Honest limitations (say these first)
- One highway sensor dataset (Minneapolis I-94); it teaches patterns, not your city's roads. It is not trained on Delhi data and uses no live traffic. Future work: local data, live APIs.
- The gradient-boosting model barely beats the seasonal baseline (MAE 221 vs 231 veh/h); say so rather than overselling accuracy.
- Minutes come from a documented delay formula and weather capacity assumptions; fuel/CO₂ are estimates.
- No login; saved commutes use an anonymous browser ID.
