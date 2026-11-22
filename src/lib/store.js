// Small localStorage helpers. Every access is wrapped: storage can be blocked or empty.
const get = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
};
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const loadSettings = (def) => ({ ...def, ...get('lw.settings', {}) });
export const saveSettings = (s) => set('lw.settings', s);

export function deviceId() {
  let id = get('lw.device', null);
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);
    set('lw.device', id);
  }
  return id;
}

export const loadLocalTrips = () => get('lw.trips', []);
export const saveLocalTrips = (t) => set('lw.trips', t);

export const loadHistory = () => get('lw.history', []);
export function pushHistory(entry) {
  const h = loadHistory();
  const last = h[0];
  if (last && last.date === entry.date && last.leave === entry.leave && last.arriveBy === entry.arriveBy) return h;
  const next = [{ ...entry, at: Date.now() }, ...h].slice(0, 30);
  set('lw.history', next);
  return next;
}
export const clearHistory = () => set('lw.history', []);
export const loadTheme = () => get('lw.theme', null);
export const saveTheme = (t) => set('lw.theme', t);
