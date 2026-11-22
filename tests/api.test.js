// Run with:  npm test      (Node's built-in test runner, no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { predictRaw, shapley, meta } from '../lib/model.js';
import { forecastDay, planDeparture, planWeek, explainHour, delayFactor } from '../lib/traffic.js';
import { estimateEvent, parseEventParams } from '../lib/events.js';
import { parseWithRules } from '../lib/ai.js';
import { extractJSON } from '../lib/llm.js';
import forecast from '../api/forecast.js';
import plan from '../api/plan.js';
import copilot from '../api/copilot.js';
import event from '../api/event.js';
import explain from '../api/explain.js';
import week from '../api/week.js';
import health from '../api/health.js';
import trips from '../api/trips.js';

delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.MONGODB_URI;

function call(handler, { method = 'POST', body = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
    handler({ method, body, query, headers: {} }, res);
  });
}

test('JS tree walker reproduces the Python (sklearn) predictions', () => {
  const gold = JSON.parse(fs.readFileSync(new URL('../ml/reports/golden.json', import.meta.url)));
  for (const g of gold) assert.ok(Math.abs(predictRaw(g.x) - g.pred) < 0.6, `mismatch ${predictRaw(g.x)} vs ${g.pred}`);
});

test('Shapley contributions add up exactly (efficiency property)', () => {
  const ex = explainHour('2026-11-23', 8, { weather: 'rain', tempC: 10 });
  const x = [8, 0, 11, 0, 10, 1.5, 0, 90, 0, 1, 0, 0];
  const s = shapley(x);
  const sum = Object.values(s.contributions).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s.base + sum - s.prediction) < 1e-6);
  assert.equal(ex.contributions.length, 5);
});

test('weekday rush hours are busier than 3 AM, weekends calmer', () => {
  const mon = forecastDay('2026-11-23', {});
  const sun = forecastDay('2026-11-22', {});
  assert.ok(mon.hours[8].volume > mon.hours[3].volume * 5);
  assert.ok(sun.hours[8].volume < mon.hours[8].volume);
  assert.ok([7, 8, 16, 17].includes(mon.peakHour));
});

test('delay factor is monotonic', () => {
  assert.ok(delayFactor(0.2) < delayFactor(0.6) && delayFactor(0.6) < delayFactor(1.0));
});

test('planner: recommended departure really meets the deadline 9 days in 10', () => {
  const day = forecastDay('2026-11-23', { weather: 'rain' });
  const p = planDeparture(day, { freeFlowMin: 40, arriveBy: 9 * 60, bufferMin: 5, nowMin: 8 * 60 });
  assert.ok(p.feasible);
  const [h, m] = p.recommended.leave.split(':').map(Number);
  assert.ok(h * 60 + m + p.recommended.p90Min + 5 <= 9 * 60 + 1);
  assert.ok(p.recommended.travelMin >= 40);
  assert.ok(p.slots.length > 10 && p.cost.extraMin >= 0);
});

test('planner: impossible deadline is reported, not crashed', () => {
  const p = planDeparture(forecastDay('2026-11-23', {}), { freeFlowMin: 120, arriveBy: 60 });
  assert.equal(p.feasible, false);
});

test('heavy rain lowers capacity and increases travel time at the same hour', () => {
  const a = planDeparture(forecastDay('2026-11-23', { weather: 'clear' }), { freeFlowMin: 30, arriveBy: 540 });
  const b = planDeparture(forecastDay('2026-11-23', { weather: 'heavy_rain' }), { freeFlowMin: 30, arriveBy: 540 });
  assert.ok(b.recommended.travelMin >= a.recommended.travelMin);
});

test('week planner returns 7 days with best/worst workday', () => {
  const w = planWeek('2026-11-25', {}, { freeFlowMin: 30, arriveBy: 540, leaveWorkAt: 1050 });
  assert.equal(w.days.length, 7);
  assert.equal(w.days[0].dow, 'Monday');
  assert.ok(w.worstDay.delayMin >= w.bestDay.delayMin);
});

test('event: bigger crowd and closures raise peak congestion; mitigation lowers it', () => {
  const base = { startMin: 18 * 60, endMin: 21 * 60, carShare: 0.4, occupancy: 2.4 };
  const small = estimateEvent('2026-11-27', {}, parseEventParams({ ...base, attendance: 2000, closure: 'none' }));
  const big = estimateEvent('2026-11-27', {}, parseEventParams({ ...base, attendance: 30000, closure: 'lane' }));
  assert.ok(big.peak.ratio > small.peak.ratio);
  assert.ok(big.scenarios.find((s) => s.key === 'shuttle').peakRatio < big.peak.ratio);
  assert.ok(big.plan.trafficPolice >= small.plan.trafficPolice);
});

test('rule-based parser understands natural language (offline copilot)', () => {
  const r = parseWithRules('I need to reach the airport by 6 pm on friday, it might rain', '2026-11-21'); // Saturday
  assert.equal(r.arriveBy, '18:00');
  assert.equal(r.date, '2026-11-27');
  assert.equal(r.weather, 'rain');
  assert.equal(r.intent, 'plan_trip');
  assert.equal(parseWithRules('concert with 20,000 people tomorrow 7pm to 10pm', '2026-11-21').intent, 'event_impact');
  assert.equal(parseWithRules('which day is best this week', '2026-11-21').intent, 'compare_days');
});

test('extractJSON copes with fenced / chatty model output', () => {
  assert.deepEqual(extractJSON('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJSON('no json'));
});

test('API: forecast + validation errors', async () => {
  const ok = await call(forecast, { body: { date: '2026-11-23', weather: 'snow' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.hours.length, 24);
  assert.equal((await call(forecast, { body: { date: 'nope' } })).status, 400);
  assert.equal((await call(forecast, { body: { date: '2026-11-23', weather: 'meteor' } })).status, 400);
  assert.equal((await call(forecast, { method: 'GET' })).status, 405);
});

test('API: plan works with template AI when no key is set', async () => {
  const r = await call(plan, { body: { date: '2026-11-23', freeFlowMin: 35, arriveBy: '09:30', ai: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ai.mode, 'template');
  assert.match(r.body.brief.headline, /Leave by/);
});

test('API: explain, week, event, health', async () => {
  const e = await call(explain, { body: { date: '2026-11-23', hour: 8, weather: 'rain' } });
  assert.equal(e.status, 200); assert.ok(e.body.explanation.summary);
  const w = await call(week, { body: { date: '2026-11-23', ai: true } });
  assert.equal(w.status, 200); assert.ok(w.body.brief.tips.length);
  const ev = await call(event, { body: { date: '2026-11-27', attendance: 15000, startTime: '18:00', endTime: '21:00', closure: 'lane', ai: true, name: 'Derby' } });
  assert.equal(ev.status, 200); assert.ok(ev.body.brief.publicAdvisory); assert.ok(ev.body.brief.actions.length);
  const h = await call(health, { method: 'GET' });
  assert.equal(h.body.llm.configured, false); assert.ok(h.body.model.metrics);
});

test('API: copilot answers offline and refuses bad input', async () => {
  const ctx = { now: '2026-11-21T07:30', settings: { freeFlowMin: 30, arriveBy: '09:00' } };
  const r = await call(copilot, { body: { messages: [{ role: 'user', content: 'When should I leave to reach by 9:30 am tomorrow? It is raining' }], context: ctx } });
  assert.equal(r.status, 200);
  assert.equal(r.body.intent, 'plan_trip');
  assert.equal(r.body.card.type, 'plan');
  assert.equal(r.body.understood.date, '2026-11-22');
  const bad = await call(copilot, { body: { messages: [] } });
  assert.equal(bad.status, 400);
  const off = await call(copilot, { body: { messages: [{ role: 'user', content: 'write me a poem about cats' }], context: ctx } });
  assert.equal(off.body.intent, 'out_of_scope');
});

test('API: trips degrades gracefully without a database', async () => {
  const r = await call(trips, { method: 'GET', query: { deviceId: 'a'.repeat(20) } });
  assert.equal(r.status, 200); assert.equal(r.body.enabled, false);
  assert.equal((await call(trips, { method: 'GET', query: { deviceId: 'x' } })).status, 400);
});

test('model card carries its data source', () => {
  assert.ok(meta.source && meta.metrics.gradient_boosting.r2 > 0.5);
});
