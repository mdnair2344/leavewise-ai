import { route, readConditions } from '../lib/http.js';
import { estimateEvent, parseEventParams, CLOSURE } from '../lib/events.js';
import { aiEventBrief } from '../lib/ai.js';
import { num, oneOf, parseTime, bool, cleanText } from '../lib/util.js';

// POST { date, name, attendance, startTime, endTime, closure, carShare(0-1), occupancy, weather, tempC, holiday, ai? }
export default route(
  async (b) => {
    const { date, cond } = readConditions(b);
    const startMin = parseTime(b.startTime, 18 * 60, 'startTime');
    const p = parseEventParams({
      attendance: num(b.attendance, { min: 50, max: 500000, def: 5000, name: 'attendance' }),
      startMin,
      endMin: parseTime(b.endTime, startMin + 180, 'endTime'),
      closure: oneOf(b.closure, Object.keys(CLOSURE), 'none', 'closure'),
      carShare: num(b.carShare, { min: 0.05, max: 0.95, def: 0.35, name: 'carShare' }),
      occupancy: num(b.occupancy, { min: 1, max: 6, def: 2.4, name: 'occupancy' }),
    });
    const event = estimateEvent(date, cond, p);
    const out = { event };
    if (bool(b.ai)) Object.assign(out, await aiEventBrief(event, cleanText(b.name, 80)));
    return out;
  },
  { ai: (b) => bool(b.ai) },
);
