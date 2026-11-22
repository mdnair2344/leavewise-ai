// All network calls go through here. Errors become readable messages (never silent).
async function request(path, { method = 'POST', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: (signal) => request('/api/health', { method: 'GET', signal }),
  plan: (body, signal) => request('/api/plan', { body, signal }),
  explain: (body, signal) => request('/api/explain', { body, signal }),
  week: (body, signal) => request('/api/week', { body, signal }),
  event: (body, signal) => request('/api/event', { body, signal }),
  copilot: (body, signal) => request('/api/copilot', { body, signal }),
  auth: {
    me: () => request('/api/auth', { method: 'GET' }),
    signup: (email, password, deviceId) => request('/api/auth', { body: { action: 'signup', email, password, deviceId } }),
    login: (email, password, deviceId) => request('/api/auth', { body: { action: 'login', email, password, deviceId } }),
    logout: () => request('/api/auth', { body: { action: 'logout' } }),
  },
  trips: {
    list: (deviceId) => request(`/api/trips?deviceId=${encodeURIComponent(deviceId)}`, { method: 'GET' }),
    save: (deviceId, trip) => request('/api/trips', { body: { deviceId, trip } }),
    remove: (deviceId, id) => request(`/api/trips?deviceId=${encodeURIComponent(deviceId)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
};