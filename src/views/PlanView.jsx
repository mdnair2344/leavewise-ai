import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Card, FormFold, LevelPill, Stat, AiBadge, Spinner, ErrorNote, Empty } from '../components/Ui.jsx';
import { DayRibbon, TripCurve, ContribBars, RouteStrip } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import TripForm from '../components/TripForm.jsx';
import { prettyDate, toMin, clock12, localDate, pad, money } from '../lib/fmt.js';
import { pushHistory } from '../lib/store.js';

const body = (s) => ({ date: s.date, weather: s.weather, tempC: s.tempC, holiday: s.holiday, freeFlowMin: s.freeFlowMin, arriveBy: s.arriveBy, bufferMin: s.bufferMin, pricePerL: s.pricePerL, tripsPerWeek: s.tripsPerWeek });

export default function PlanView({ s, set, onHistory }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hour, setHour] = useState(null);
  const [drivers, setDrivers] = useState(null);
  const [driversErr, setDriversErr] = useState('');
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const nowTime = useMemo(() => {
    if (s.date !== localDate()) return undefined;
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [s.date]);

  // forecast + plan (debounced, cancels stale requests)
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true); setErr('');
      try {
        const r = await api.plan({ ...body(s), nowTime }, ctl.signal);
        setData(r); setAi(null);
      } catch (e) { if (e.name !== 'AbortError') setErr(e.message); } finally { setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [s.date, s.arriveBy, s.freeFlowMin, s.weather, s.tempC, s.holiday, s.bufferMin, s.pricePerL, s.tripsPerWeek, nowTime]); // eslint-disable-line

  const rec = data?.plan.recommended;

  // log to "plans made" only after the plan has been stable for 2s (dragging a slider is not many plans)
  useEffect(() => {
    if (!data?.plan.recommended) return;
    const t = setTimeout(() => {
      const p = data.plan;
      onHistory(pushHistory({ date: s.date, arriveBy: s.arriveBy, leave: p.recommended.leave, saved: Math.max(0, Math.round(p.worstSlot.travelMin - p.recommended.travelMin)) }));
    }, 2000);
    return () => clearTimeout(t);
  }, [data]); // eslint-disable-line
  const midHour = rec ? Math.min(23, Math.round((toMin(rec.leave) + rec.travelMin / 2) / 60)) : 8;
  const focus = hour ?? midHour;
  useEffect(() => { setHour(null); }, [s.date, s.arriveBy]);

  // Shapley drivers for the focus hour (cheap, no LLM)
  useEffect(() => {
    if (!data) return;
    const ctl = new AbortController();
    setDriversErr('');
    api.explain({ date: s.date, hour: focus, weather: s.weather, tempC: s.tempC, holiday: s.holiday, ai: false }, ctl.signal)
      .then((r) => setDrivers(r.explain)).catch((e) => { if (e.name !== 'AbortError') setDriversErr(e.message); });
    return () => ctl.abort();
  }, [data, focus]); // eslint-disable-line

  async function askAi() {
    setAiBusy(true); setErr('');
    try {
      const [p, x] = await Promise.all([
        api.plan({ ...body(s), nowTime, ai: true }),
        api.explain({ date: s.date, hour: focus, weather: s.weather, tempC: s.tempC, holiday: s.holiday, ai: true }),
      ]);
      setAi({ brief: p.brief, ai: p.ai, text: x.explanation });
    } catch (e) { setErr(e.message); } finally { setAiBusy(false); }
  }

  const plan = data?.plan;
  const markers = rec ? [{ min: toMin(rec.leave), label: `Leave ${rec.leaveDisplay}`, color: 'var(--ink)' }, ...(plan.fastest ? [{ min: toMin(plan.fastest.leave), label: `Faster ${plan.fastest.leaveDisplay}`, color: 'var(--ink2)' }] : [])] : [];

  return (
    <div className="split">
      <aside><FormFold summary={`Trip settings · ${s.freeFlowMin} min · by ${s.arriveBy}`}><TripForm s={s} set={set} /></FormFold></aside>
      <div className="stack">
        <ErrorNote error={err} />
        {!data && !err && <Card><Spinner label="Forecasting your day…" /></Card>}
        {data && (
          <>
            <section className={`hero ${busy ? 'busy' : ''}`} aria-live="polite">
              {rec ? (
                <>
                  <div className="hero-main">
                    <span className="hero-kicker">Leave by</span>
                    <div className="hero-time">{rec.leaveDisplay}</div>
                    <p className="hero-sub">to arrive by <b>{plan.arriveByDisplay}</b> on {prettyDate(s.date)}</p>
                    <RouteStrip hours={data.hours} leave={rec.leave} arrive={rec.arrive} />
                    <div className="route-ends"><span>{rec.leaveDisplay}</span><span>{rec.arriveDisplay}</span></div>
                    {plan.now && (
                      <p className={`hero-now ${plan.now.onTime ? 'ok' : 'late'}`}>
                        <Icon name={plan.now.onTime ? 'check' : 'warn'} size={16} />
                        <span>{plan.now.onTime ? `Leaving right now (${plan.now.leaveDisplay}) still gets you there on time.` : `Leaving now (${plan.now.leaveDisplay}) could make you ~${plan.now.minutesLateAtP90} min late on a bad day.`}</span>
                      </p>
                    )}
                  </div>
                  <dl className="hero-facts">
                    <div><dt>Trip time</dt><dd>{rec.travelMin} min</dd></div>
                    <div><dt>Arrive</dt><dd>{rec.arriveDisplay}</dd></div>
                    <div><dt>Bad day</dt><dd>{rec.p90Min} min</dd></div>
                    <div><dt>Traffic</dt><dd><LevelPill level={rec.level} /></dd></div>
                  </dl>
                </>
              ) : (
                <div className="hero-main">
                  <span className="hero-kicker">Not possible</span>
                  <div className="hero-time small">Too early</div>
                  <p className="hero-sub">A {plan.freeFlowMin}-minute trip can’t fit before {plan.arriveByDisplay}. Pick a later arrival time.</p>
                </div>
              )}
            </section>

            {plan.fastest && (
              <p className="callout"><Icon name="spark" size={18} /><span> Leave <b>{plan.fastest.leaveEarlierBy} min earlier ({plan.fastest.leaveDisplay})</b> and the trip drops to {plan.fastest.travelMin} min, saving <b>{plan.fastest.savedMin} min</b>.</span></p>
            )}

            {plan.cost && (
              <Card title="What traffic costs you on this trip" className="kpis">
                <div className="stats">
                  <Stat icon="clock" value={plan.cost.extraMin} unit="min" label="lost to traffic" />
                  <Stat icon="fuel" value={plan.cost.litres} unit="L" label="extra fuel (estimate)" />
                  <Stat icon="leaf" value={plan.cost.co2kg} unit="kg" label="extra CO₂ (estimate)" />
                  <Stat icon="plan" value={money(plan.cost.weekly.money)} label={`per week · ${plan.cost.weekly.extraMin} min`} />
                </div>
              </Card>
            )}

            <Card title="Traffic across the day" aside={<span className="hint">Select an hour to see what drives it</span>}>
              <DayRibbon hours={data.hours} markers={markers} selected={focus} onSelect={setHour} />
              <div className="legend row traffic-key">
                {['low', 'moderate', 'heavy', 'severe'].map((l) => <LevelPill key={l} level={l} />)}
              </div>
            </Card>

            <Card title="Trip time by departure time">
              <TripCurve slots={plan.slots} freeFlowMin={plan.freeFlowMin} recommended={rec} fastest={plan.fastest} now={nowTime ? toMin(nowTime) : null} />
              <details className="more"><summary>View as table</summary>
                <div className="tablewrap"><table><thead><tr><th>Leave</th><th>Expected</th><th>Bad day</th></tr></thead>
                  <tbody>{plan.slots.filter((_, i) => i % 3 === 0).map((x) => <tr key={x.t}><td>{clock12(x.t)}</td><td>{Math.round(x.travelMin)} min</td><td>{Math.round(x.p90Min)} min</td></tr>)}</tbody></table></div>
              </details>
            </Card>

            <Card title={`Why is ${clock12(focus * 60).replace(':00', '')} like this?`} aside={drivers && <LevelPill level={drivers.level} />}
              className="xai">
              {drivers ? (
                <>
                  <p className="muted">Vehicles per hour compared with the average hour ({drivers.averageVolume.toLocaleString()}). Predicted: <b>{drivers.predictedVolume.toLocaleString()}</b>.</p>
                  <ContribBars items={drivers.contributions} />
                  {drivers.capacityLossPercent > 0 && <p className="note"><Icon name="rain" size={15} /> This weather also removes about {drivers.capacityLossPercent}% of road capacity, so roads feel busier than the vehicle count suggests.</p>}
                </>
              ) : driversErr ? <ErrorNote error={driversErr} /> : <Spinner label="Computing drivers…" />}
              <div className="ai-row">
                <button className="btn primary" onClick={askAi} disabled={aiBusy}><Icon name="spark" size={16} /> {aiBusy ? 'Thinking…' : 'Explain with AI'}</button>
                {ai && <AiBadge ai={ai.ai} />}
              </div>
              {ai && (
                <div className="ai-out">
                  <h3>{ai.brief.headline}</h3>
                  <p>{ai.brief.summary}</p>
                  {ai.brief.tips?.length > 0 && <ul>{ai.brief.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {ai.text && <div className="ai-sub"><h4>{ai.text.headline}</h4><p>{ai.text.summary}</p>{ai.text.takeaway && <p><b>{ai.text.takeaway}</b></p>}</div>}
                </div>
              )}
            </Card>
          </>
        )}
        {!data && err && <Empty icon="warn" title="No forecast yet">Fix the problem above and your plan will appear here.</Empty>}
      </div>
    </div>
  );
}