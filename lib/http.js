// Thin wrapper so every API route has the same validation, error format and security headers.
import { HttpError, rateLimit, num, oneOf, bool, parseDate } from './util.js';
import { WEATHER_KEYS } from './traffic.js';

export function route(fn, { methods = ['POST'], ai = false } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, `Use ${methods.join(' or ')}`);
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = body ? JSON.parse(body) : {}; } catch { throw new HttpError(400, 'Body must be valid JSON'); }
      }
      body = body && typeof body === 'object' ? body : {};
      // `ai` is true/false, or a function of the parsed body so routes that only sometimes call the LLM
      // (body.ai) are throttled only when they do - and plain forecast calls never use up the AI quota.
      if (typeof ai === 'function' ? ai(body) : ai) {
        const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
        rateLimit(ip, { max: Number(process.env.AI_RATE_LIMIT || 40) });
      }
      const out = await fn(body, req, res);
      res.status(200).json(out);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
    }
  };
}

/** Parse the common "conditions" block shared by most endpoints. */
export function readConditions(b, { defDate } = {}) {
  return {
    date: parseDate(b.date, defDate),
    cond: {
      weather: oneOf(b.weather, WEATHER_KEYS, 'clear', 'weather'),
      tempC: num(b.tempC, { min: -35, max: 50, def: 18, name: 'tempC' }),
      holiday: bool(b.holiday),
    },
  };
}

export function readCost(b) {
  return { pricePerL: num(b.pricePerL, { min: 1, max: 1000, def: 100, name: 'pricePerL' }), tripsPerWeek: num(b.tripsPerWeek, { min: 1, max: 30, def: 10, name: 'tripsPerWeek' }) };
}