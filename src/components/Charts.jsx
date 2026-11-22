// Hand-built SVG/HTML charts (no chart library = tiny bundle, nothing to break on deploy).
import { useState, useRef } from 'react';
import { clock12, hour12, DAYS, LEVELS } from '../lib/fmt.js';

const lvVar = (level) => `var(--lv-${(LEVELS[level] || LEVELS.low).css})`;

// ---------------------------------------------------------------- Day ribbon
export function DayRibbon({ hours, markers = [], selected = null, onSelect }) {
  const W = 720, seg = W / 24;
  return (
    <figure className="chart" aria-label="Congestion by hour of the day">
      <svg viewBox={`0 0 ${W} 96`} role="img" aria-label="Hourly congestion ribbon">
        {hours.map((h) => (
          <g key={h.hour}>
            <rect
              x={h.hour * seg + 1} y={34} width={seg - 2} height={34} rx={5}
              fill={lvVar(h.level)} className={`ribbon-seg ${selected === h.hour ? 'sel' : ''}`}
              onClick={() => onSelect?.(h.hour)} tabIndex={onSelect ? 0 : undefined}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(h.hour)}
              role={onSelect ? 'button' : undefined}
              aria-label={`${clock12(h.hour * 60)}: ${(LEVELS[h.level] || {}).label}, about ${h.volume} vehicles per hour`}
            >
              <title>{`${clock12(h.hour * 60)} · ${LEVELS[h.level]?.label} · ~${h.volume.toLocaleString()} vehicles/h`}</title>
            </rect>
            {selected === h.hour && <rect x={h.hour * seg + 1} y={34} width={seg - 2} height={34} rx={4} fill="none" stroke="var(--ink)" strokeWidth="2.5" pointerEvents="none" />}
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} x={h * seg + 2} y={86} className="axis">{hour12(h)}</text>
        ))}
        {markers.map((m, i) => {
          const x = (m.min / 1440) * W;
          const anchor = x > W - 70 ? 'end' : x < 70 ? 'start' : 'middle';
          return (
            <g key={i}>
              <path d={`M${x - 6} 24 L${x + 6} 24 L${x} 33 Z`} fill={m.color || 'var(--ink)'} />
              <text x={x} y={16} textAnchor={anchor} className="marker-label">{m.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

// ---------------------------------------------------------------- Route strip (Maps-style)
// Colours the journey from departure to arrival using the hourly congestion levels already computed by the forecast.
export function RouteStrip({ hours, leave, arrive }) {
  if (!hours?.length || !leave || !arrive) return null;
  const a = toM(leave), b = Math.max(toM(arrive), a + 1);
  const parts = [];
  for (let t = a; t < b;) {
    const h = Math.min(23, Math.floor(t / 60));
    const end = Math.min(b, (h + 1) * 60);
    parts.push({ w: end - t, level: hours[h]?.level || 'low', h });
    t = end;
  }
  return (
    <div className="route" role="img" aria-label={`Route from ${clock12(a)} to ${clock12(b)} coloured by expected congestion`}>
      <span className="route-node start" />
      <div className="route-line">
        {parts.map((p, i) => <i key={i} style={{ flex: p.w, background: lvVar(p.level) }} title={`${clock12(p.h * 60)} · ${LEVELS[p.level]?.label}`} />)}
      </div>
      <span className="route-node end" />
    </div>
  );
}
const toM = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

// ---------------------------------------------------------------- Trip time vs departure
export function TripCurve({ slots, freeFlowMin, recommended, fastest, now }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  if (!slots?.length) return null;
  const W = 720, H = 270, L = 44, R = 14, T = 20, B = 34;
  const x0 = slots[0].t, x1 = slots[slots.length - 1].t;
  const ymax = Math.ceil(Math.max(...slots.map((s) => s.p90Min), freeFlowMin * 1.2) / 5) * 5;
  const ymin = Math.max(0, Math.floor((freeFlowMin * 0.8) / 5) * 5);
  const X = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - T - B);
  const line = (k) => slots.map((s, i) => `${i ? 'L' : 'M'}${X(s.t).toFixed(1)} ${Y(s[k]).toFixed(1)}`).join(' ');
  const band = `${line('p90Min')} ${slots.slice().reverse().map((s) => `L${X(s.t).toFixed(1)} ${Y(s.travelMin).toFixed(1)}`).join(' ')} Z`;
  const yticks = [];
  for (let v = ymin; v <= ymax; v += Math.max(5, Math.round((ymax - ymin) / 4 / 5) * 5)) yticks.push(v);
  const xticks = [];
  for (let t = Math.ceil(x0 / 60) * 60; t <= x1; t += 60) xticks.push(t);
  const hv = hover !== null ? slots[hover] : null;

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = x0 + ((px - L) / (W - L - R)) * (x1 - x0);
    let best = 0;
    slots.forEach((s, i) => { if (Math.abs(s.t - t) < Math.abs(slots[best].t - t)) best = i; });
    setHover(best);
  }
  const mk = (min, label, color, dy = 0) => min == null ? null : (
    <g>
      <line x1={X(min)} x2={X(min)} y1={T} y2={H - B} stroke={color} strokeWidth="2" strokeDasharray="5 4" />
      <text x={X(min)} y={T - 6 + dy} textAnchor="middle" className="marker-label" style={{ fill: color }}>{label}</text>
    </g>
  );
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

  return (
    <figure className="chart tripcurve" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected trip time by departure time">
        {yticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {xticks.map((t) => <text key={t} x={X(t)} y={H - 12} textAnchor="middle" className="axis">{clock12(t).replace(':00', '')}</text>)}
        <text x={L} y={12} className="axis">minutes</text>
        <line x1={L} x2={W - R} y1={Y(freeFlowMin)} y2={Y(freeFlowMin)} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="2 4" />
        <text x={W - R} y={Y(freeFlowMin) - 5} textAnchor="end" className="axis">empty-road time {freeFlowMin} min</text>
        <defs><linearGradient id="tcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--s1)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--s1)" stopOpacity="0.04" /></linearGradient></defs>
        <path d={band} fill="url(#tcg)" />
        <path d={line('p90Min')} fill="none" stroke="var(--s1)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        <path d={line('travelMin')} fill="none" stroke="var(--s1)" strokeWidth="2.5" strokeLinejoin="round" />
        {mk(recommended ? toMin(recommended.leave) : null, 'Leave by', 'var(--ink)')}
        {mk(fastest ? toMin(fastest.leave) : null, 'Faster', 'var(--ink2)', 0)}
        {hv && (
          <g>
            <line x1={X(hv.t)} x2={X(hv.t)} y1={T} y2={H - B} stroke="var(--ink2)" strokeWidth="1" />
            <circle cx={X(hv.t)} cy={Y(hv.travelMin)} r="5" fill="var(--s1)" stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
        {now && x0 <= now && now <= x1 && <circle cx={X(now)} cy={T + 6} r="4" fill="var(--ink2)" />}
      </svg>
      {hv && (
        <div className="tip" style={{ left: `${(X(hv.t) / W) * 100}%` }}>
          <strong>Leave {clock12(hv.t)}</strong>
          <span>~{Math.round(hv.travelMin)} min (bad day {Math.round(hv.p90Min)})</span>
          <span>arrive {clock12(hv.arriveMin)}</span>
        </div>
      )}
      <figcaption className="legend">
        <span><i className="sw line" /> expected trip time</span>
        <span><i className="sw band" /> range on a bad day (90th percentile)</span>
        {recommended && <span><i className="sw dash" /> recommended departure</span>}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- Shapley contributions
export function ContribBars({ items }) {
  const max = Math.max(...items.map((i) => Math.abs(i.vehicles)), 1);
  return (
    <ul className="contrib" aria-label="What pushes traffic up or down">
      {items.map((i) => {
        const w = (Math.abs(i.vehicles) / max) * 50;
        const up = i.vehicles >= 0;
        return (
          <li key={i.key}>
            <span className="contrib-label">{i.label}</span>
            <span className="contrib-track">
              <span className="contrib-axis" />
              <span className={`contrib-bar ${up ? 'up' : 'down'}`} style={{ width: `${w}%`, [up ? 'left' : 'right']: '50%' }} />
            </span>
            <span className="contrib-val">{up ? '+' : '−'}{Math.abs(i.vehicles).toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Single-hue ramp (light → deep brand blue): darker = closer to road capacity.
const trafficColor = (r) => {
  const x = Math.max(0, Math.min(1, r));
  return `color-mix(in oklab, var(--heat-hi) ${Math.round(x * 100)}%, var(--heat-lo))`;
};

// ---------------------------------------------------------------- Week heat-map
export function WeekHeat({ days }) {
  const [tip, setTip] = useState(null);
  return (
    <div className="heat" role="table" aria-label="Congestion by day and hour">
      <div className="heat-row heat-head" role="row">
        <span className="heat-day" />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="heat-hr" role="columnheader">{h % 3 === 0 ? hour12(h) : ''}</span>)}
      </div>
      {days.map((d, i) => (
        <div className="heat-row" key={d.date} role="row">
          <span className="heat-day" role="rowheader">{DAYS[i]}</span>
          {d.ratios.map((r, h) => {
            const p = Math.round(Math.min(1, r / 1.0) * 100);
            const marks = [d.outbound && parseInt(d.outbound.leave, 10) === h, d.ret && parseInt(d.ret.leave, 10) === h].filter(Boolean);
            return (
              <span
                key={h} role="cell" className={`heat-cell ${marks.length ? 'mark' : ''}`}
                style={{ background: trafficColor(r) }}
                onMouseEnter={() => setTip({ i, h, r })} onMouseLeave={() => setTip(null)}
                title={`${DAYS[i]} ${clock12(h * 60)} · ${Math.round(r * 100)}% of road capacity`}
              />
            );
          })}
        </div>
      ))}
      <div className="heat-legend">
        <span>quiet</span><i className="heat-ramp" /><span>at capacity</span>
        <span className="heat-dotkey"><i className="heat-dot" /> your trips</span>
        {tip && <strong className="heat-tip">{DAYS[tip.i]} {clock12(tip.h * 60)}: {Math.round(tip.r * 100)}% of capacity</strong>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Event stacked bars
export function EventBars({ hours, capacity, startMin, endMin }) {
  const [hv, setHv] = useState(null);
  const W = 720, H = 270, L = 52, R = 12, T = 18, B = 30;
  const tot = (h) => h.baselineVolume + h.extraVehicles;
  const ymax = Math.ceil(Math.max(capacity, ...hours.map(tot)) * 1.08 / 1000) * 1000;
  const bw = (W - L - R) / 24;
  const Y = (v) => T + (1 - v / ymax) * (H - T - B);
  const X = (m) => L + (m / 1440) * (W - L - R);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((ymax / 4) * i));
  return (
    <figure className="chart" onMouseLeave={() => setHv(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vehicles per hour: normal traffic plus event traffic">
        <rect x={X(startMin)} y={T} width={X(endMin) - X(startMin)} height={H - T - B} fill="var(--ink)" opacity="0.06" />
        {ticks.map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="axis">{v.toLocaleString()}</text></g>
        ))}
        {hours.map((h) => {
          const x = L + h.hour * bw + 2;
          const w = bw - 4;
          return (
            <g key={h.hour} onMouseEnter={() => setHv(h)}>
              <rect x={x} y={Y(h.baselineVolume)} width={w} height={Y(0) - Y(h.baselineVolume)} fill="var(--s2)" rx="2" stroke="var(--card)" strokeWidth="2" />
              {h.extraVehicles > 0 && <rect x={x} y={Y(tot(h))} width={w} height={Y(h.baselineVolume) - Y(tot(h))} fill="var(--s1)" rx="2" stroke="var(--card)" strokeWidth="2" />}
              <rect x={x - 2} y={T} width={bw} height={H - T - B} fill="transparent"><title>{`${clock12(h.hour * 60)}: ${h.baselineVolume.toLocaleString()} normal + ${h.extraVehicles.toLocaleString()} event vehicles/h`}</title></rect>
              {h.hour % 3 === 0 && <text x={x + w / 2} y={H - 10} textAnchor="middle" className="axis">{hour12(h.hour)}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={Y(capacity)} y2={Y(capacity)} stroke="var(--lv-severe)" strokeWidth="2" strokeDasharray="6 4" />
        <text x={W - R} y={Y(capacity) - 6} textAnchor="end" className="marker-label" style={{ fill: 'var(--lv-severe)' }}>road capacity {capacity.toLocaleString()}/h</text>
      </svg>
      <figcaption className="legend">
        <span><i className="sw sq s2" /> normal traffic</span>
        <span><i className="sw sq s1" /> extra from the event</span>
        <span><i className="sw shade" /> event time</span>
        {hv && <strong className="legend-now">{clock12(hv.hour * 60)}: {hv.baselineVolume.toLocaleString()} + {hv.extraVehicles.toLocaleString()} vehicles/h</strong>}
      </figcaption>
    </figure>
  );
}