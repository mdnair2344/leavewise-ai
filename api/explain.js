import { route, readConditions } from '../lib/http.js';
import { explainHour } from '../lib/traffic.js';
import { aiExplain } from '../lib/ai.js';
import { num, bool } from '../lib/util.js';

// POST { date, hour, weather, tempC, holiday, ai? } -> Shapley attribution (+ plain-English AI explanation)
export default route(
  async (b) => {
    const { date, cond } = readConditions(b);
    const hour = Math.round(num(b.hour, { min: 0, max: 23, def: 8, name: 'hour' }));
    const ex = explainHour(date, hour, cond);
    const out = { explain: ex };
    if (bool(b.ai, true)) Object.assign(out, await aiExplain(ex));
    return out;
  },
  { ai: (b) => bool(b.ai, true) },
);
