// Provider-agnostic LLM client (Gemini, Anthropic, or any OpenAI-compatible API such as Groq/OpenAI/OpenRouter).
// Every call asks for JSON and is validated by the caller. If no key is configured, or a call fails,
// callers fall back to deterministic templates (see ai.js) so the app never breaks.
import { HttpError } from './util.js';

const env = (k) => (process.env[k] || '').trim();

export function llmConfig() {
  const forced = env('LLM_PROVIDER').toLowerCase();
  const pick = forced || (env('GEMINI_API_KEY') ? 'gemini' : env('ANTHROPIC_API_KEY') ? 'anthropic' : env('OPENAI_API_KEY') ? 'openai' : '');
  if (pick === 'gemini' && env('GEMINI_API_KEY')) return { provider: 'gemini', key: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL') || 'gemini-3.5-flash-lite' };
  if (pick === 'anthropic' && env('ANTHROPIC_API_KEY')) return { provider: 'anthropic', key: env('ANTHROPIC_API_KEY'), model: env('ANTHROPIC_MODEL') || 'claude-haiku-5-5' };
  if (pick === 'openai' && env('OPENAI_API_KEY')) {
    return { provider: 'openai', key: env('OPENAI_API_KEY'), model: env('OPENAI_MODEL') || 'gpt-4o-mini', base: (env('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '') };
  }
  return null;
}

export function llmStatus() {
  const c = llmConfig();
  return c ? { configured: true, provider: c.provider, model: c.model } : { configured: false, provider: null, model: null };
}

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJSON(text) {
  if (typeof text !== 'string') throw new Error('empty model reply');
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in model reply');
  return JSON.parse(cleaned.slice(a, b + 1));
}

async function post(url, init, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const raw = await res.text();
    if (!res.ok) {
      const err = new Error(`LLM HTTP ${res.status}: ${raw.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const transient = (e) => [429, 500, 502, 503, 504].includes(e?.status) || e?.name === 'AbortError';

/** Retry transient provider errors (overload / rate limit) a couple of times with backoff. */
async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!transient(e) || i === tries - 1) throw e;
      await sleep(500 * 2 ** i + Math.random() * 250);
    }
  }
  throw last;
}

// Backup Gemini models tried (in order) when the primary one stays overloaded.
const GEMINI_BACKUPS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];

/**
 * Ask the model for a JSON object.
 * @returns {{data: object, provider: string, model: string, ms: number}}
 */
export async function askJSON({ system, user, maxTokens = 700, temperature = 0.3, timeoutMs = 12000 }) {
  const c = llmConfig();
  if (!c) throw new HttpError(503, 'No LLM configured');
  const t0 = Date.now();
  let text;
  let usedModel = c.model;
  if (c.provider === 'gemini') {
    const models = [c.model, ...GEMINI_BACKUPS.filter((m) => m !== c.model)];
    let lastErr;
    for (const model of models) {
      try {
        const j = await withRetry(() => post(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': c.key },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
            }),
          },
          timeoutMs,
        ), 2);
        text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
        usedModel = model;
        break;
      } catch (e) {
        lastErr = e;
        // overload, or this model name is unknown/retired (404) / not allowed for the key: try the next model
        if (!transient(e) && e?.status !== 404) throw e;
      }
    }
    if (text === undefined) throw lastErr;
  } else if (c.provider === 'anthropic') {
    const j = await post(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens, temperature, system: system + '\nReply with one JSON object only.', messages: [{ role: 'user', content: user }] }),
      },
      timeoutMs,
    );
    text = j?.content?.map((p) => p.text || '').join('');
  } else {
    const j = await post(
      `${c.base}/chat/completions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` },
        body: JSON.stringify({
          model: c.model, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      },
      timeoutMs,
    );
    text = j?.choices?.[0]?.message?.content;
  }
  return { data: extractJSON(text), provider: c.provider, model: usedModel, ms: Date.now() - t0 };
}

/** Run an LLM task; on any failure return the template result and say why. */
export async function withFallback(llmTask, templateTask) {
  const cfg = llmConfig();
  if (!cfg) return { ...templateTask(), ai: { mode: 'template', reason: 'no-api-key' } };
  try {
    const r = await llmTask();
    return { ...r.result, ai: { mode: 'llm', provider: r.provider, model: r.model, ms: r.ms } };
  } catch (e) {
    console.error('[llm] falling back to template:', e.message);
    return { ...templateTask(), ai: { mode: 'template', reason: /429|quota|RESOURCE_EXHAUSTED/i.test(e.message) ? 'quota' : 'error' } };
  }
}