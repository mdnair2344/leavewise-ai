import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, FormFold, LevelPill, Stat, AiBadge, ErrorNote, Spinner, Segmented } from '../components/Ui.jsx';
import { EventBars } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import { toMin, WEATHER_OPTIONS } from '../lib/fmt.js';

const CLOSURES = [{ value: 'none', label: 'None' }, { value: 'lane', label: 'One lane' }, { value: 'major', label: 'Road closed' }];

export default function EventView({ s }) {
  const [f, setF] = useState({ name: 'City derby match', date: s.date, startTime: '18:00', endTime: '21:00', attendance: 20000, carShare: 35, closure: 'lane', weather: s.weather });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const upd = (k) => (e) => (k === 'date' && !e.target.value ? null : setF({ ...f, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value }));
  const body = (extra = {}) => ({ name: f.name, date: f.date, startTime: f.startTime, endTime: f.endTime, attendance: f.attendance, carShare: f.carShare / 100, closure: f.closure, weather: f.weather, tempC: s.tempC, holiday: s.holiday, ...extra });

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try { setErr(''); const r = await api.event(body(), ctl.signal); setRes(r.event); setAi(null); }
      catch (e) { if (e.name !== 'AbortError') setErr(e.message); }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [f.date, f.startTime, f.endTime, f.attendance, f.carShare, f.closure, f.weather, s.tempC, s.holiday]); // eslint-disable-line

  async function ask() {
    setAiBusy(true);
    try { setAi(await api.event(body({ ai: true }))); } catch (e) { setErr(e.message); } finally { setAiBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(ai.brief.publicAdvisory); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr('Copy failed. Select the text and copy it manually.'); }
  }

  return (
    <div className="split">
      <aside>
        <FormFold summary={`Event details · ${f.name || 'Untitled'}`}>
        <Card title="Event details" className="form-card">
          <div className="field"><label htmlFor="en">Name</label><input id="en" value={f.name} maxLength={80} onChange={upd('name')} /></div>
          <div className="field"><label htmlFor="ed">Date</label><input id="ed" type="date" value={f.date} onChange={upd('date')} /></div>
          <div className="field two">
            <div><label htmlFor="es">Starts</label><input id="es" type="time" value={f.startTime} onChange={upd('startTime')} /></div>
            <div><label htmlFor="ee">Ends</label><input id="ee" type="time" value={f.endTime} onChange={upd('endTime')} /></div>
          </div>
          <div className="field"><label htmlFor="ea">Expected crowd <b className="val">{f.attendance.toLocaleString()}</b></label>
            <input id="ea" type="range" min="500" max="100000" step="500" value={f.attendance} onChange={upd('attendance')} /></div>
          <div className="field"><label htmlFor="ec">Arriving by car <b className="val">{f.carShare}%</b></label>
            <input id="ec" type="range" min="5" max="90" step="5" value={f.carShare} onChange={upd('carShare')} /></div>
          <div className="field"><span className="label">Road closure</span><Segmented label="Road closure" value={f.closure} onChange={(v) => setF({ ...f, closure: v })} options={CLOSURES} /></div>
          <div className="field"><label htmlFor="ew">Weather</label>
            <select id="ew" value={f.weather} onChange={upd('weather')}>{WEATHER_OPTIONS.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</select></div>
        </Card>
        </FormFold>
      </aside>
      <div className="stack">
        <ErrorNote error={err} />
        {!res && !err && <Card><Spinner label="Estimating impact…" /></Card>}
        {res && (
          <>
            <section className="hero event-hero">
              <div className="hero-main">
                <span className="hero-kicker">Worst hour</span>
                <div className="hero-time">{res.peak.hourDisplay}</div>
                <p className="hero-sub">{Math.round(res.peak.ratio * 100)}% of road capacity, versus {Math.round(res.peak.baselineRatio * 100)}% on a normal day ({res.peak.amplification}× busier)</p>
                <div className="cap" role="img" aria-label={`${Math.round(res.peak.ratio * 100)}% of road capacity used`}>
                  <i style={{ width: `${Math.min(100, res.peak.ratio * 100)}%`, background: `var(--lv-${({ low: 'low', moderate: 'mod', heavy: 'heavy', severe: 'severe' })[res.peak.level] || 'low'})` }} />
                </div>
              </div>
              <dl className="hero-facts">
                <div><dt>Level</dt><dd><LevelPill level={res.peak.level} /></dd></div>
                <div><dt>Extra vehicles/h</dt><dd>{res.peak.extraVehicles.toLocaleString()}</dd></div>
                <div><dt>Car trips</dt><dd>{res.carTrips.toLocaleString()}</dd></div>
              </dl>
            </section>
            <Card title="Vehicles per hour"><EventBars hours={res.hours} capacity={res.effectiveCapacity} startMin={toMin(res.event.start)} endMin={toMin(res.event.end)} /></Card>
            <Card title="Suggested deployment" className="kpis">
              <div className="stats">
                <Stat icon="users" value={res.plan.trafficPolice} label="traffic police" />
                <Stat icon="users" value={res.plan.marshals} label="marshals" />
                <Stat icon="warn" value={res.plan.barricades} label="barricades" />
              </div>
              <p className="diversion"><b>Diversion:</b> {res.plan.diversion}.</p>
              <p className="muted small">Planning heuristics derived from the extra vehicles and crowd size, not official deployment norms.</p>
            </Card>
            <Card title="What if…">
              <ul className="whatif">
                {res.scenarios.map((x) => <li key={x.key}><span>{x.label}</span><b>{Math.round(x.peakRatio * 100)}%</b><LevelPill level={x.level} /></li>)}
                {res.bestStart && <li><span>Start at {res.bestStart.startDisplay} instead</span><b>{Math.round(res.bestStart.peakRatio * 100)}%</b><LevelPill level={res.bestStart.level} /></li>}
              </ul>
            </Card>
            <Card title="AI event brief">
              <div className="ai-row">
                <button className="btn primary" onClick={ask} disabled={aiBusy}><Icon name="spark" size={16} /> {aiBusy ? 'Writing…' : 'Write the brief'}</button>
                {ai && <AiBadge ai={ai.ai} />}
              </div>
              {ai && (
                <div className="ai-out">
                  <h3>{ai.brief.headline}</h3><p>{ai.brief.summary}</p>
                  {ai.brief.risks?.length > 0 && <><h4>Risks</h4><ul>{ai.brief.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
                  <h4>Action plan</h4>
                  <ol className="timeline">{ai.brief.actions.map((a, i) => <li key={i}><b>{a.when}</b><span>{a.action}</span></li>)}</ol>
                  <h4>Public advisory</h4>
                  <blockquote>{ai.brief.publicAdvisory}</blockquote>
                  <button className="btn" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copied' : 'Copy advisory'}</button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
