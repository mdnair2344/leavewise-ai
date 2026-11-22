// Provider-agnostic LLM client (Gemini, Anthropic, or any OpenAI-compatible API such as Groq/OpenAI/OpenRouter).
// Every call asks for JSON and is validated by the caller. If no key is configured, or a call fails,
// callers fall back to deterministic templates (see ai.js) so the app never breaks.
import { HttpError } from './util.js';

const env = (k) => (process.env[k] || '').trim();

export function llmConfig() {
  const forced = env('LLM_PROVIDER').toLowerCase();
  const pick = forced || (env('GEMINI_API_KEY') ? 'gemini' : env('ANTHROPIC_API_KEY') ? 'anthropic' : env('OPENAI_API_KEY') ? 'openai' : '');
  if (pick === 'gemini' && env('GEMINI_API_KEY')) return { provider: 'gemini', key: env('GEMINI_API_KEY'), model: env('GEMINI_MODEL') || 'gemini-flash-latest' };
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
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${raw.slice(0, 200)}`);
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the model for a JSON object.
 * @returns {{data: object, provider: string, model: string, ms: number}}
 */
export async function askJSON({ system, user, maxTokens = 700, temperature = 0.3, timeoutMs = 12000 }) {
  const c = llmConfig();
  if (!c) throw new HttpError(503, 'No LLM configured');
  const t0 = Date.now();
  let text;
  if (c.provider === 'gemini') {
    const j = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`,
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
    );
    text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
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
  return { data: extractJSON(text), provider: c.provider, model: c.model, ms: Date.now() - t0 };
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
