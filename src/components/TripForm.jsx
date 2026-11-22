import Icon from './Icon.jsx';
import { WEATHER_OPTIONS } from '../lib/fmt.js';
import { Card } from './Ui.jsx';

export default function TripForm({ s, set, show = ['route', 'when', 'weather'] }) {
  const upd = (k) => (e) => (k === 'date' && !e.target.value ? null : set({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value }));
  return (
    <Card title="Your trip" className="form-card">
      {show.includes('route') && (
        <div className="field">
          <label htmlFor="ff">Trip time on empty roads <b className="val">{s.freeFlowMin} min</b></label>
          <input id="ff" type="range" min="5" max="120" step="1" value={s.freeFlowMin} onChange={upd('freeFlowMin')} />
          <small>How long it takes at 3 AM. Look it up once in any maps app.</small>
        </div>
      )}
      {show.includes('when') && (
        <>
          <div className="field">
            <label htmlFor="dt">Day</label>
            <input id="dt" type="date" value={s.date} onChange={upd('date')} />
          </div>
          <div className="field two">
            <div>
              <label htmlFor="ab">Be there by</label>
              <input id="ab" type="time" value={s.arriveBy} onChange={upd('arriveBy')} />
            </div>
            <div>
              <label htmlFor="lw">Head home at</label>
              <input id="lw" type="time" value={s.leaveWorkAt} onChange={upd('leaveWorkAt')} />
            </div>
          </div>
        </>
      )}
      {show.includes('weather') && (
        <>
          <div className="field">
            <span className="label">Weather</span>
            <div className="chips" role="group" aria-label="Weather">
              {WEATHER_OPTIONS.map((w) => (
                <button key={w.key} type="button" className={`chip ${s.weather === w.key ? 'on' : ''}`} aria-pressed={s.weather === w.key} onClick={() => set({ ...s, weather: w.key })}>
                  <Icon name={w.icon} size={16} /> {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="tp">Temperature <b className="val">{s.tempC}°C</b></label>
            <input id="tp" type="range" min="-10" max="45" value={s.tempC} onChange={upd('tempC')} />
          </div>
          <label className="check">
            <input type="checkbox" checked={s.holiday} onChange={upd('holiday')} />
            <span>Public holiday or festival day</span>
          </label>
        </>
      )}
      <details className="more">
        <summary>Safety buffer and cost settings</summary>
        <div className="field two">
          <div>
            <label htmlFor="bf">Extra buffer (min)</label>
            <input id="bf" type="number" min="0" max="30" value={s.bufferMin} onChange={upd('bufferMin')} />
          </div>
          <div>
            <label htmlFor="pr">Petrol price (₹/L)</label>
            <input id="pr" type="number" min="1" value={s.pricePerL} onChange={upd('pricePerL')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tw">Commute trips per week</label>
          <input id="tw" type="number" min="1" max="30" value={s.tripsPerWeek} onChange={upd('tripsPerWeek')} />
        </div>
      </details>
    </Card>
  );
}
