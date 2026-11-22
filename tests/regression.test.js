// Regression tests for bugs fixed in the first hardening pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWeek } from '../lib/traffic.js';
import { parseWithRules } from '../lib/ai.js';
import { isRealDate, parseDate } from '../lib/util.js';
import explain from '../api/explain.js';
import plan from '../api/plan.js';
import week from '../api/week.js';

delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.MONGODB_URI;
process.env.AI_RATE_LIMIT = '5';

const call = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
  handler({ method: 'POST', body, headers: {}, query: {} }, res);
});

test('weekly cost equals the delay actually shown (was overstated 5x)', () => {
  const w = planWeek('2026-11-23', {}, { freeFlowMin: 30, arriveBy: 540, leaveWorkAt: 1050 });
  const litres = (w.totalDelayMin / 60) * 0.9;
  assert.ok(Math.abs(w.weeklyCost.weekly.litres - litres) <= 0.15, `${w.weeklyCost.weekly.litres} vs ${litres}`);
  assert.ok(Math.abs(w.weeklyCost.weekly.extraMin - w.totalDelayMin) <= 5);
});

test('week planner: holidays[] marks only the listed day', () => {
  const base = { freeFlowMin: 30, arriveBy: 540, leaveWorkAt: 1050 };
  const none = planWeek('2026-11-23', {}, base);
  const thu = planWeek('2026-11-23', {}, { ...base, holidays: ['2026-11-26'] });
  assert.equal(thu.days[0].delayMin, none.days[0].delayMin); // Monday untouched
  assert.notEqual(thu.days[3].delayMin, none.days[3].delayMin); // Thursday changed
});

test('only real calendar dates are accepted', () => {
  assert.equal(isRealDate('2026-02-28'), true);
  assert.equal(isRealDate('2028-02-29'), true);
  assert.equal(isRealDate('2026-02-31'), false);
  assert.equal(isRealDate('2026-04-31'), false);
  assert.throws(() => parseDate('2026-02-31'), /YYYY-MM-DD/);
  assert.equal(parseWithRules('leave on 2026-02-31 by 9am', '2026-11-21').date, null);
});

test('rule parser: "train" is not rain, but real rain words still work', () => {
  assert.equal(parseWithRules('I take the train to office by 9am', '2026-11-21').weather, null);
  assert.equal(parseWithRules('it will be rainy tomorrow', '2026-11-21').weather, 'rain');
  assert.equal(parseWithRules('heavy rain expected', '2026-11-21').weather, 'heavy_rain');
  assert.equal(parseWithRules('foggy morning', '2026-11-21').weather, 'fog');
});

test('rate limit: non-AI calls never use the AI quota; AI calls on plan/week are throttled', async () => {
  for (let i = 0; i < 30; i++) assert.equal((await call(explain, { date: '2026-11-23', hour: 8, ai: false })).status, 200);
  for (let i = 0; i < 30; i++) assert.equal((await call(plan, { date: '2026-11-23' })).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await call(plan, { date: '2026-11-23', ai: true })).status, 200);
  assert.equal((await call(plan, { date: '2026-11-23', ai: true })).status, 429);
  assert.equal((await call(week, { date: '2026-11-23', ai: true })).status, 429);
  // plain forecasts still work for a throttled client
  assert.equal((await call(plan, { date: '2026-11-23' })).status, 200);
  assert.equal((await call(explain, { date: '2026-11-23', hour: 8, ai: false })).status, 200);
});
