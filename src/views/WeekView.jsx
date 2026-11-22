import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, FormFold, AiBadge, Stat, ErrorNote, Spinner, LevelPill } from '../components/Ui.jsx';
import { WeekHeat } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import TripForm from '../components/TripForm.jsx';
import { DAYS, money, prettyDate } from '../lib/fmt.js';

const body = (s) => ({ date: s.date, weather: s.weather, tempC: s.tempC, holidays: s.holiday ? [s.date] : [], freeFlowMin: s.freeFlowMin, arriveBy: s.arriveBy, leaveWorkAt: s.leaveWorkAt, bufferMin: s.bufferMin, pricePerL: s.pricePerL, tripsPerWeek: s.tripsPerWeek });

export default function WeekView({ s, set }) {
  const [week, setWeek] = useState(null);
  const [err, setErr] = useState('');
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try { setErr(''); const r = await api.week(body(s), ctl.signal); setWeek(r.week); setAi(null); }
      catch (e) { if (e.name !== 'AbortError') setErr(e.message); }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [s.date, s.weather, s.tempC, s.holiday, s.freeFlowMin, s.arriveBy, s.leaveWorkAt, s.bufferMin, s.pricePerL, s.tripsPerWeek]); // eslint-disable-line

  async function ask() {
    setAiBusy(true);
    try { const r = await api.week({ ...body(s), ai: true }); setAi(r); } catch (e) { setErr(e.message); } finally { setAiBusy(false); }
  }

  return (
    <div className="split">
      <aside><FormFold summary={`Trip settings · ${s.freeFlowMin} min · by ${s.arriveBy}`}><TripForm s={s} set={set} /></FormFold></aside>
      <div className="stack">
        <ErrorNote error={err} />
        {!week && !err && <Card><Spinner label="Forecasting the week…" /></Card>}
        {week && (
          <>
            <Card title={`Week of ${prettyDate(week.weekStart)}`} aside={<span className="hint">Dots mark your two daily trips</span>}>
              <WeekHeat days={week.days} />
            </Card>
            <div className="duo">
              <Card title="Easiest day" className="daycard good"><div className="big-day good">{week.bestDay.dow}</div><p className="muted">Only {week.bestDay.delayMin} min lost to traffic across both trips.</p></Card>
              <Card title="Hardest day" className="daycard bad"><div className="big-day bad">{week.worstDay.dow}</div><p className="muted">{week.worstDay.delayMin} min lost. {week.savingIfWorstDayFlexible >= 3 ? `Moving it saves up to ${week.savingIfWorstDayFlexible} min.` : 'Your working days are almost equally busy.'}</p></Card>
            </div>
            <Card title="Day by day">
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Day</th><th>Leave home</th><th>Morning trip</th><th>Evening trip</th><th>Lost to traffic</th></tr></thead>
                  <tbody>
                    {week.days.map((d, i) => (
                      <tr key={d.date} className={d.isWeekend ? 'dim' : ''}>
                        <td>{DAYS[i]}</td>
                        <td>{d.outbound ? d.outbound.leaveDisplay : '—'}</td>
                        <td>{d.outbound ? <>{d.outbound.travelMin} min <LevelPill level={d.outbound.level} /></> : '—'}</td>
                        <td>{d.ret.travelMin} min <LevelPill level={d.ret.level} /></td>
                        <td><b>{d.delayMin} min</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="stats">
                <Stat icon="clock" value={week.totalDelayMin} unit="min" label="lost this working week" />
                <Stat icon="fuel" value={week.weeklyCost.weekly.litres} unit="L" label="extra fuel (estimate)" />
                <Stat icon="leaf" value={week.weeklyCost.weekly.co2kg} unit="kg" label="extra CO₂ (estimate)" />
                <Stat icon="plan" value={money(week.weeklyCost.weekly.money)} label="fuel cost of delays" />
              </div>
            </Card>
            <Card title="AI weekly briefing">
              <div className="ai-row">
                <button className="btn primary" onClick={ask} disabled={aiBusy}><Icon name="spark" size={16} /> {aiBusy ? 'Thinking…' : 'Write my weekly briefing'}</button>
                {ai && <AiBadge ai={ai.ai} />}
              </div>
              {ai && <div className="ai-out"><h3>{ai.brief.headline}</h3><p>{ai.brief.summary}</p><ul>{ai.brief.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
