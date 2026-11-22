import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { LEVELS } from '../lib/fmt.js';

export const Card = ({ title, aside, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || aside) && (
      <header className="card-head">
        {title && <h2>{title}</h2>}
        {aside}
      </header>
    )}
    <div className={pad ? 'card-body' : ''}>{children}</div>
  </section>
);

export const LevelPill = ({ level, text }) => {
  const l = LEVELS[level] || LEVELS.low;
  return (
    <span className={`pill lv-${l.css}`}>
      <span className="pill-dot" />
      {text || l.label}
    </span>
  );
};

export const Spinner = ({ label = 'Working…' }) => (
  <span className="spinner" role="status" aria-live="polite">
    <span className="spin" /> {label}
  </span>
);

export const Stat = ({ icon, value, unit, label, tone }) => (
  <div className={`stat ${tone || ''}`}>
    <div className="stat-label">{icon && <Icon name={icon} size={15} className="stat-icon" />} {label}</div>
    <div className="stat-num">
      {value}
      {unit && <span className="stat-unit">{unit}</span>}
    </div>
  </div>
);

export function AiBadge({ ai }) {
  if (!ai) return null;
  if (ai.mode === 'llm') return <span className="badge ai-on" title={`${ai.provider} · ${ai.model} · ${ai.ms} ms`}><Icon name="spark" size={13} /> AI · {ai.model}</span>;
  const why = { 'no-api-key': 'No AI key set on the server', quota: 'AI quota reached', error: 'AI service error' }[ai.reason] || 'Template mode';
  return <span className="badge ai-off" title={why}><Icon name="cloudOff" size={13} /> Template mode · {why}</span>;
}

export const Segmented = ({ value, onChange, options, label }) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.value} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

export const ErrorNote = ({ error }) => (error ? <p className="error" role="alert"><Icon name="warn" size={16} /> {error}</p> : null);

export const Empty = ({ icon = 'info', title, children }) => (
  <div className="empty">
    <Icon name={icon} size={26} />
    <strong>{title}</strong>
    <p>{children}</p>
  </div>
);

// Trip settings: always open on desktop, collapsible on small screens so the answer is visible first.
export function FormFold({ summary, children }) {
  const q = '(max-width: 1000px)';
  const [open, setOpen] = useState(() => !matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOpen(!m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return (
    <details className="fold" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><Icon name="route" size={16} /> <span>{summary}</span> <Icon name="chevron" size={16} className="fold-chev" /></summary>
      {children}
    </details>
  );
}
