import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './components/Icon.jsx';
import PlanView from './views/PlanView.jsx';
import CopilotView from './views/CopilotView.jsx';
import WeekView from './views/WeekView.jsx';
import EventView from './views/EventView.jsx';
import SavedView from './views/SavedView.jsx';
import AboutView from './views/AboutView.jsx';
import { loadSettings, saveSettings, loadHistory, loadTheme, saveTheme } from './lib/store.js';
import { localDate } from './lib/fmt.js';

const TABS = [
  ['plan', 'Plan', 'plan'],
  ['copilot', 'Copilot', 'chat'],
  ['week', 'Week', 'week'],
  ['events', 'Events', 'event'],
  ['saved', 'Saved', 'save'],
  ['about', 'About', 'info'],
];

const PAGES = {
  plan: ['Dashboard', 'Your departure plan and the traffic forecast for the day'],
  copilot: ['Copilot', 'Ask in plain language. Numbers come from the forecast model'],
  week: ['Week', 'Find your easiest and hardest commuting days'],
  events: ['Events', 'Estimate road impact and plan a response'],
  saved: ['Saved', 'Your commutes and planning activity'],
  about: ['About', 'How LeaveWise works, and what it can’t tell you'],
};

const TAB_KEYS = TABS.map(([k]) => k);
const tabFromHash = () => { const h = location.hash.slice(1); return TAB_KEYS.includes(h) ? h : 'plan'; };

const DEFAULTS = { freeFlowMin: 30, arriveBy: '09:00', leaveWorkAt: '17:30', weather: 'clear', tempC: 22, holiday: false, bufferMin: 5, pricePerL: 100, tripsPerWeek: 10 };

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [s, setS] = useState(() => ({ ...loadSettings(DEFAULTS), date: localDate() }));
  const [health, setHealth] = useState(null);
  const [history, setHistory] = useState(loadHistory());
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => loadTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  useEffect(() => { saveSettings({ ...s, date: undefined }); }, [s]);
  useEffect(() => { document.documentElement.dataset.theme = theme; saveTheme(theme); }, [theme]);
  useEffect(() => { location.hash = tab; }, [tab]);
  useEffect(() => { api.auth.me().then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  const logout = () => api.auth.logout().finally(() => setUser(null));
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => { const f = () => setTab(tabFromHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);

  const page = PAGES[tab];
  const aiLive = !!health?.llm?.configured;

  return (
    <div className="shell">
      <aside className="side" aria-label="Primary">
        <a className="brand" href="#plan" aria-label="LeaveWise home">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--brand)" /><path d="M14 40h10l6-18 8 26 6-14h6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>LeaveWise</span>
        </a>
        <nav aria-label="Sections">
          <span className="nav-group">Workspace</span>
          {TABS.slice(0, 5).map(([k, label, icon]) => (
            <button key={k} className={`nav-item ${tab === k ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
              <Icon name={icon} size={17} /> <span>{label}</span>
            </button>
          ))}
          <span className="nav-group">Product</span>
          {TABS.slice(5).map(([k, label, icon]) => (
            <button key={k} className={`nav-item ${tab === k ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
              <Icon name={icon} size={17} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        {health?.auth?.enabled && (
          <div className="acct">
            {user ? (
              <>
                <span className="acct-mail" title={user.email}><Icon name="user" size={15} /> {user.email}</span>
                <button className="btn ghost" onClick={logout} aria-label="Sign out"><Icon name="logout" size={15} /></button>
              </>
            ) : (
              <button className="btn" onClick={() => setTab('saved')}><Icon name="user" size={15} /> Sign in</button>
            )}
          </div>
        )}
        <div className="side-foot">
          <div className="status" title={aiLive ? `${health.llm.provider} · ${health.llm.model}` : 'Built-in templates are used'}>
            <i className={`dot ${aiLive ? 'live' : ''}`} />
            <span>{health ? (aiLive ? 'AI connected' : 'Template mode') : 'Connecting…'}</span>
          </div>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <a className="brand mobile-only" href="#plan" aria-label="LeaveWise home">
            <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--brand)" /><path d="M14 40h10l6-18 8 26 6-14h6" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <div className="crumbs">
            <h1>{page[0]}</h1>
            <p>{page[1]}</p>
          </div>
          <button className="icon-btn mobile-only" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </header>

        <div className="banners">
          {health?.model?.isSynthetic && (
            <div className="banner warn"><Icon name="warn" size={16} /> <span>Demo model: trained on synthetic data. Retrain with the real Kaggle dataset before relying on the numbers.</span></div>
          )}
          {health && !health.llm.configured && (
            <div className="banner info"><Icon name="cloudOff" size={16} /> <span>AI key not set on the server, so briefings and the Copilot use built-in templates. Add GEMINI_API_KEY to enable live AI.</span></div>
          )}
        </div>

        <main className={`view view-${tab}`}>
          {tab === 'plan' && <PlanView s={s} set={setS} onHistory={setHistory} />}
          {tab === 'copilot' && <CopilotView s={s} />}
          {tab === 'week' && <WeekView s={s} set={setS} />}
          {tab === 'events' && <EventView s={s} />}
          {tab === 'saved' && <SavedView s={s} set={setS} health={health} history={history} setHistory={setHistory} user={user} setUser={setUser} onLogout={logout} />}
          {tab === 'about' && <AboutView health={health} />}
        </main>
        <footer>Forecasts are estimates, not live traffic.</footer>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            <Icon name={icon} size={20} /> <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}