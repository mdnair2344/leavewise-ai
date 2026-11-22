import { Card } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';

const WHY = [
  ['clock', 'You lose time you never planned for', 'Commuters make the same decision every day: when to leave. A 20-minute shift can be the difference between a calm 25-minute trip and a 50-minute crawl.'],
  ['fuel', 'Idling costs money and air quality', 'Time lost in traffic burns fuel and adds CO₂. LeaveWise turns delay into litres, kilograms and rupees so the cost is visible.'],
  ['week', 'Weekly planning beats daily guessing', 'Knowing Thursday is your worst day lets you work from home, shift meetings or leave earlier before the week starts.'],
  ['event', 'Events break normal patterns', 'Matches, concerts and processions flood roads for a few hours. Organisers get an impact estimate and a ready-to-post public advisory.'],
];
const AI = [
  ['chat', 'Commute Copilot', 'An LLM turns free text into structured slots (date, deadline, weather), the app runs the forecast tools, and the LLM explains the result using only those computed facts.'],
  ['spark', 'Explainable AI', 'Exact Shapley values split a prediction into time of day, weekday, season, weather and holiday. The LLM then narrates those numbers in plain English.'],
  ['plan', 'AI briefings', 'Daily plan, weekly outlook and event briefs (risks, action timeline, public advisory) are generated from model outputs and validated before display.'],
  ['check', 'Safe by design', 'Untrusted text is fenced, outputs must be valid JSON, and any failure falls back to template text. The app never breaks if the AI is unavailable.'],
];

function Metric({ k, v }) { return <div className="metric"><span>{k}</span><b>{v}</b></div>; }

export default function AboutView({ health }) {
  const m = health?.model;
  const gb = m?.metrics?.gradient_boosting;
  return (
    <div className="stack wide about">
      <Card title="Why this matters every day">
        <div className="grid2">
          {WHY.map(([icon, t, p]) => <div key={t} className="why"><span className="why-ico"><Icon name={icon} size={18} /></span><h3>{t}</h3><p>{p}</p></div>)}
        </div>
      </Card>
      <Card title="How it works">
        <ol className="flow">
          <li><b>Your inputs</b><span>date, deadline, weather, trip length</span></li>
          <li><b>ML forecaster</b><span>gradient-boosted trees predict vehicles per hour</span></li>
          <li><b>Travel-time model</b><span>volume vs capacity gives minutes, plus a bad-day range</span></li>
          <li><b>AI layer</b><span>LLM understands your words and explains the numbers</span></li>
          <li><b>You</b><span>leave time, weekly plan, event brief</span></li>
        </ol>
      </Card>
      <Card title="Where AI is used">
        <div className="grid2">{AI.map(([icon, t, p]) => <div key={t} className="why"><span className="why-ico"><Icon name={icon} size={18} /></span><h3>{t}</h3><p>{p}</p></div>)}</div>
        <p className="muted small">Live AI: {health?.llm?.configured ? `${health.llm.provider} · ${health.llm.model}` : 'not configured on this server (template mode)'}.</p>
      </Card>
      {m && (
        <Card title="Model card">
          {m.isSynthetic && <p className="banner warn"><Icon name="warn" size={16} /> This deployment ships a model trained on synthetic demo data. Retrain on the real dataset before quoting any numbers (see README).</p>}
          <div className="metrics">
            <Metric k="Data source" v={m.source} />
            <Metric k="Rows used" v={m.rows.toLocaleString()} />
            <Metric k="Period" v={`${m.from.slice(0, 10)} → ${m.to.slice(0, 10)}`} />
            <Metric k="Model" v={m.type} />
            <Metric k="Evaluation" v={m.split} />
            {gb && <Metric k="Test MAE" v={`${gb.mae} veh/h`} />}
            {gb && <Metric k="Test R²" v={gb.r2} />}
            {m.metrics?.interval_80_coverage_on_test != null && <Metric k="80% range, actual coverage" v={`${Math.round(m.metrics.interval_80_coverage_on_test * 1000) / 10}% on test data`} />}
            <Metric k="Trained" v={m.trainedAt} />
          </div>
          <p className="muted small">Dataset: {m.dataset}.</p>
        </Card>
      )}
      <Card title="Assumptions and limits">
        <ul className="plain">
          <li>The model predicts how many vehicles pass a point, trained on one highway sensor. It learns the shape of rush hours, weekends, holidays and weather. It is not live traffic and does not know about accidents. It was trained on Minneapolis I-94 data, not Delhi roads, so use it to learn patterns rather than as a local prediction.</li>
          <li>Minutes are derived with a documented delay formula ({health?.assumptions?.delayFormula}). The constants are planning assumptions you can tune.</li>
          <li>Weather also reduces road capacity in the planner. Those percentages are assumptions, because volume data alone cannot show how slowly cars moved.</li>
          <li>Fuel and CO₂ use {health?.assumptions?.idleLitresPerHour} L/h and {health?.assumptions?.co2KgPerLitre} kg CO₂ per litre of petrol. Treat them as estimates.</li>
          <li>Event deployments are heuristics for planning, not official traffic-police norms.</li>
          <li>Privacy: no login. Settings stay in your browser. Saved commutes use a random anonymous ID.</li>
        </ul>
      </Card>
    </div>
  );
}
