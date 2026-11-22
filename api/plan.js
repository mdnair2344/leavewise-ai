import { route, readConditions, readCost } from '../lib/http.js';
import { forecastDay, planDeparture } from '../lib/traffic.js';
import { aiPlanBrief } from '../lib/ai.js';
import { num, parseTime, bool } from '../lib/util.js';

// POST { date, weather, tempC, holiday, freeFlowMin, arriveBy:"HH:MM", bufferMin, nowTime?, ai? }
export default route(
  async (b) => {
    const { date, cond } = readConditions(b);
    const freeFlowMin = num(b.freeFlowMin, { min: 5, max: 180, def: 30, name: 'freeFlowMin' });
    const arriveBy = parseTime(b.arriveBy, 9 * 60, 'arriveBy');
    const bufferMin = num(b.bufferMin, { min: 0, max: 30, def: 5, name: 'bufferMin' });
    const nowMin = b.nowTime ? parseTime(b.nowTime, null, 'nowTime') : null;
    const day = forecastDay(date, cond);
    const plan = planDeparture(day, { freeFlowMin, arriveBy, bufferMin, nowMin, cost: readCost(b) });
    const out = { plan, hours: day.hours, conditions: day.conditions };
    if (bool(b.ai)) Object.assign(out, await aiPlanBrief(plan, day.conditions));
    return out;
  },
  { ai: (b) => bool(b.ai) },
);
