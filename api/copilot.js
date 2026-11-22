import { route } from '../lib/http.js';
import { copilot } from '../lib/ai.js';
import { HttpError, num, oneOf, parseDate, parseTime, bool, cleanText } from '../lib/util.js';
import { WEATHER_KEYS } from '../lib/traffic.js';

// POST { messages:[{role,content}], context:{ now:"YYYY-MM-DDTHH:MM", settings:{...} } }
export default route(
  async (b) => {
    const raw = Array.isArray(b.messages) ? b.messages : [];
    const messages = raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: cleanText(m.content, 600) }))
      .filter((m) => m.content)
      .slice(-8);
    if (!messages.length || messages[messages.length - 1].role !== 'user') throw new HttpError(400, 'Send at least one user message.');

    const c = b.context && typeof b.context === 'object' ? b.context : {};
    const nowStr = typeof c.now === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c.now) ? c.now : new Date().toISOString();
    const today = parseDate(nowStr.slice(0, 10));
    const nowMin = parseTime(nowStr.slice(11, 16), 0);
    const s = c.settings && typeof c.settings === 'object' ? c.settings : {};
    const settings = {
      freeFlowMin: num(s.freeFlowMin, { min: 5, max: 180, def: 30 }),
      arriveBy: (() => { parseTime(s.arriveBy, 540); return typeof s.arriveBy === 'string' && s.arriveBy ? s.arriveBy.padStart(5, '0') : '09:00'; })(),
      leaveWorkAt: typeof s.leaveWorkAt === 'string' && s.leaveWorkAt ? s.leaveWorkAt : '17:30',
      weather: oneOf(s.weather, WEATHER_KEYS, 'clear'),
      tempC: num(s.tempC, { min: -35, max: 50, def: 18 }),
      holiday: bool(s.holiday),
      bufferMin: num(s.bufferMin, { min: 0, max: 30, def: 5 }),
      cost: { pricePerL: num(s.pricePerL, { min: 1, max: 1000, def: 100 }), tripsPerWeek: num(s.tripsPerWeek, { min: 1, max: 30, def: 10 }) },
    };
    return copilot(messages, { today, nowMin, settings });
  },
  { ai: true },
);
