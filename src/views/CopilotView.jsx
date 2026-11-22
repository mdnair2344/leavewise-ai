import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { AiBadge, LevelPill, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { localNowISO, prettyDate, clock12, hour12 } from '../lib/fmt.js';

const STARTERS = [
  'When should I leave tomorrow to reach by 9:30 AM? It might rain.',
  'Which day this week is the worst for my commute?',
  'Why is traffic so bad at 6 PM on Friday?',
  'A concert with 20,000 people is on Saturday 7 PM to 10 PM. What happens to traffic?',
];

function MiniCard({ card }) {
  if (!card) return null;
  const d = card.data;
  if (card.type === 'plan') {
    const r = d.recommended;
    return r ? (
      <div className="mini">
        <div><span className="mini-k">Leave by</span><b className="mini-big">{r.leaveDisplay}</b></div>
        <div><span className="mini-k">Trip</span><b>{r.travelMin} min</b></div>
        <div><span className="mini-k">Arrive</span><b>{r.arriveDisplay}</b></div>
        <LevelPill level={r.level} />
      </div>
    ) : <div className="mini"><span>That arrival time is not reachable.</span></div>;
  }
  if (card.type === 'week') {
    return <div className="mini"><div><span className="mini-k">Best</span><b>{d.bestDay.dow}</b></div><div><span className="mini-k">Hardest</span><b>{d.worstDay.dow}</b></div><div><span className="mini-k">Lost this week</span><b>{d.totalDelayMin} min</b></div></div>;
  }
  if (card.type === 'explain') {
    return <div className="mini col">{d.contributions.slice(0, 3).map((c) => <div key={c.key}><span className="mini-k">{c.label}</span><b>{c.vehicles >= 0 ? '+' : '−'}{Math.abs(c.vehicles).toLocaleString()} veh/h</b></div>)}</div>;
  }
  if (card.type === 'event') {
    return <div className="mini"><div><span className="mini-k">Peak</span><b>{d.peak.hourDisplay}</b></div><div><span className="mini-k">Capacity used</span><b>{Math.round(d.peak.ratio * 100)}%</b></div><LevelPill level={d.peak.level} /><div><span className="mini-k">Police / marshals</span><b>{d.plan.trafficPolice} / {d.plan.marshals}</b></div></div>;
  }
  return null;
}

export default function CopilotView({ s }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  async function send(content) {
    const q = (content ?? text).trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await api.copilot({
        messages: next.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, content: m.content })),
        context: { now: localNowISO(), settings: { freeFlowMin: s.freeFlowMin, arriveBy: s.arriveBy, leaveWorkAt: s.leaveWorkAt, weather: s.weather, tempC: s.tempC, holiday: s.holiday, bufferMin: s.bufferMin, pricePerL: s.pricePerL, tripsPerWeek: s.tripsPerWeek } },
      });
      setMsgs([...next, { role: 'assistant', content: r.reply, card: r.card, ai: r.ai, followUps: r.followUps, understood: r.understood }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: e.message, error: true }]);
    } finally { setBusy(false); }
  }

  const arriveLabel = clock12(Number(s.arriveBy.slice(0, 2)) * 60 + Number(s.arriveBy.slice(3)));
  return (
    <div className="copilot">
      <div className="chat">
        <div className="chat-log" aria-live="polite">
          {!msgs.length && (
            <div className="chat-intro">
              <span className="ai-mark"><Icon name="spark" size={20} /></span>
              <h2>What do you need to plan?</h2>
              <p>Tell me where you need to be and when. I read your message, run the traffic forecast, and explain the answer. Numbers always come from the forecasting model, never from the AI’s imagination.</p>
              <div className="starters grid">{STARTERS.map((q) => <button key={q} className="starter" onClick={() => send(q)}><Icon name="spark" size={14} /> <span>{q}</span></button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role} ${m.error ? 'err' : ''}`}>
              {m.role === 'assistant' && <span className="avatar"><Icon name={m.error ? 'warn' : 'spark'} size={14} /></span>}
              <div className="msg-body">
                <div className="bubble">
                  <p>{m.content}</p>
                  {m.understood && <p className="understood">Understood: {prettyDate(m.understood.date)} · by {m.understood.arriveBy} · {m.understood.weather.replace('_', ' ')} · {m.understood.freeFlowMin} min trip</p>}
                  <MiniCard card={m.card} />
                  {m.role === 'assistant' && m.ai && <AiBadge ai={m.ai} />}
                </div>
                {m.followUps?.length > 0 && i === msgs.length - 1 && <div className="starters">{m.followUps.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="msg assistant"><span className="avatar"><Icon name="spark" size={14} /></span><div className="msg-body"><div className="bubble"><Spinner label="Checking the forecast…" /></div></div></div>}
          <div ref={end} />
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr" htmlFor="q">Message</label>
          <div className="composer">
            <input id="q" enterKeyHint="send" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything, e.g. I must be at the airport by 6 PM on Friday" maxLength={500} autoComplete="off" />
            <button className="send" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
          </div>
        </form>
      </div>
      <aside className="ctx" aria-label="Trip context used by the Copilot">
        <h3>Context</h3>
        <p className="hint">The Copilot uses your saved trip. Change it on the Dashboard.</p>
        <dl>
          <div><dt>Empty-road trip</dt><dd>{s.freeFlowMin} min</dd></div>
          <div><dt>Be there by</dt><dd>{arriveLabel}</dd></div>
          <div><dt>Head home at</dt><dd>{clock12(Number(s.leaveWorkAt.slice(0, 2)) * 60 + Number(s.leaveWorkAt.slice(3)))}</dd></div>
          <div><dt>Weather</dt><dd className="cap-first">{s.weather.replace('_', ' ')}, {s.tempC}°C</dd></div>
        </dl>
      </aside>
    </div>
  );
}
