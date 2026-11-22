import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, Empty, ErrorNote, Stat } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { deviceId, loadLocalTrips, saveLocalTrips, clearHistory } from '../lib/store.js';
import { clock12, toMin } from '../lib/fmt.js';
import AuthCard from '../components/AuthCard.jsx';

export default function SavedView({ s, set, health, history, setHistory, user, setUser, onLogout }) {
  const cloud = !!health?.database?.configured;
  const accounts = !!health?.auth?.enabled;
  const [trips, setTrips] = useState(() => (cloud ? [] : loadLocalTrips()));
  const [name, setName] = useState('Home to work');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const id = deviceId();

  useEffect(() => {
    if (!cloud) { setTrips(loadLocalTrips()); return; }
    api.trips.list(id).then((r) => r.enabled && setTrips(r.trips)).catch((e) => setErr(e.message));
  }, [cloud, id, user?.id]);

  async function save() {
    setBusy(true); setErr('');
    const trip = { name: name.trim() || 'My commute', freeFlowMin: s.freeFlowMin, arriveBy: s.arriveBy, leaveWorkAt: s.leaveWorkAt };
    try {
      if (cloud) {
        const r = await api.trips.save(id, trip);
        setTrips((cur) => [r.trip, ...cur]);
      } else {
        const t = [{ ...trip, id: `${Date.now()}`, createdAt: new Date().toISOString() }, ...trips].slice(0, 20);
        setTrips(t); saveLocalTrips(t);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function remove(t) {
    setErr('');
    try {
      if (cloud) await api.trips.remove(id, t.id);
      const next = trips.filter((x) => x.id !== t.id);
      setTrips(next); if (!cloud) saveLocalTrips(next);
    } catch (e) { setErr(e.message); }
  }

  const totalSaved = history.reduce((a, h) => a + (h.saved || 0), 0);
  return (
    <div className="stack wide">
      <ErrorNote error={err} />
      {accounts && !user && <AuthCard onUser={setUser} />}
      {user && (
        <Card title="Account">
          <div className="acct-row">
            <span><Icon name="user" size={16} /> Signed in as <b>{user.email}</b></span>
            <button className="btn" onClick={onLogout}><Icon name="logout" size={16} /> Sign out</button>
          </div>
        </Card>
      )}
      <div className="duo">
        <Card title="Save this commute">
          <p className="muted">Saves your trip time ({s.freeFlowMin} min), arrival ({clock12(toMin(s.arriveBy))}) and evening departure ({clock12(toMin(s.leaveWorkAt))}).</p>
          <div className="field"><label htmlFor="tn">Name</label><input id="tn" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
          <button className="btn primary" onClick={save} disabled={busy}><Icon name="save" size={16} /> Save commute</button>
          <p className="muted small">{user ? `Stored in your account (${user.email}) and available on any device you sign in on.` : cloud ? 'Stored in the cloud database under an anonymous ID for this browser. Sign in to keep them across devices.' : 'Stored only in this browser. Add a MongoDB connection on the server to sync (see README).'}</p>
        </Card>
        <Card title="Your planning activity" className="kpis">
          <div className="stats">
            <Stat icon="plan" value={history.length} label="plans made" />
            <Stat icon="clock" value={totalSaved} unit="min" label="avoidable delay spotted" />
          </div>
          <p className="muted small">“Avoidable delay” = the trip-time gap between the busiest departure time and the one we recommended. It is an upper-bound estimate, not a measured saving.</p>
          {history.length > 0 && <button className="btn" onClick={() => { clearHistory(); setHistory([]); }}><Icon name="trash" size={16} /> Clear activity</button>}
        </Card>
      </div>
      <Card title="Saved commutes">
        {!trips.length ? <Empty icon="save" title="Nothing saved yet">Set up your usual trip on the Plan tab, then save it here to reload it in one tap.</Empty> : (
          <ul className="trips">
            {trips.map((t) => (
              <li key={t.id}>
                <div className="trip-main"><span className="trip-ico"><Icon name="route" size={16} /></span><div><b>{t.name}</b><span className="trip-meta"><span>{t.freeFlowMin} min trip</span><span>Be there by {clock12(toMin(t.arriveBy))}</span><span>Home at {clock12(toMin(t.leaveWorkAt))}</span></span></div></div>
                <div className="row-actions">
                  <button className="btn" onClick={() => { set({ ...s, freeFlowMin: t.freeFlowMin, arriveBy: t.arriveBy, leaveWorkAt: t.leaveWorkAt }); location.hash = 'plan'; }}>Use</button>
                  <button className="btn ghost" onClick={() => remove(t)} aria-label={`Delete ${t.name}`}><Icon name="trash" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}