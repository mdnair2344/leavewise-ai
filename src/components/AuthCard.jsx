import { useState } from 'react';
import { api } from '../api.js';
import { Card, ErrorNote } from './Ui.jsx';
import Icon from './Icon.jsx';
import { deviceId } from '../lib/store.js';

// Sign in / create account. Guests can keep using the app without one.
export default function AuthCard({ onUser }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await (mode === 'signup' ? api.auth.signup : api.auth.login)(email, password, deviceId());
      setPassword('');
      onUser(r.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <Card title={mode === 'signup' ? 'Create an account' : 'Sign in'}>
      <p className="muted">Sign in to keep your saved commutes on every device. Commutes you saved on this browser as a guest move into your account.</p>
      <ErrorNote error={err} />
      <form onSubmit={submit} className="authform">
        <div className="field"><label htmlFor="ae">Email</label><input id="ae" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="ap">Password</label>
          <input id="ap" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'signup' && <small>At least 8 characters.</small>}
        </div>
        <div className="auth-actions">
          <button className="btn primary" type="submit" disabled={busy}><Icon name="user" size={16} /> {mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <button className="btn ghost" type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); }}>
            {mode === 'signup' ? 'I already have an account' : 'Create an account'}
          </button>
        </div>
      </form>
    </Card>
  );
}