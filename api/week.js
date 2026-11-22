import { route, readConditions, readCost } from '../lib/http.js';
import { planWeek } from '../lib/traffic.js';
import { aiWeekBrief } from '../lib/ai.js';
import { num, parseTime, bool, parseDate } from '../lib/util.js';

// POST { date (any day of the week), weather, tempC, freeFlowMin, arriveBy, leaveWorkAt, holidays:[YYYY-MM-DD], ai? }
export default route(async (b) => {
  const { date, cond } = readConditions(b);
  const holidays = Array.isArray(b.holidays) ? b.holidays.slice(0, 7).map((d) => parseDate(d)) : [];
  const week = planWeek(date, cond, {
    freeFlowMin: num(b.freeFlowMin, { min: 5, max: 180, def: 30, name: 'freeFlowMin' }),
    arriveBy: parseTime(b.arriveBy, 9 * 60, 'arriveBy'),
    leaveWorkAt: parseTime(b.leaveWorkAt, 17 * 60 + 30, 'leaveWorkAt'),
    bufferMin: num(b.bufferMin, { min: 0, max: 30, def: 5, name: 'bufferMin' }),
    cost: readCost(b),
    holidays,
  });
  const out = { week };
  if (bool(b.ai)) Object.assign(out, await aiWeekBrief(week));
  return out;
}, { ai: (b) => bool(b.ai) });
