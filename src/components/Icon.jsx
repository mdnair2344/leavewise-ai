const P = {
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  plan: 'M4 18h4l3-9 4 12 3-7h2',
  chat: 'M5 5h14v10H9l-4 4V5Z',
  week: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
  event: 'M5 20V5l9 3-9 3M5 20h2',
  save: 'M7 4h10v16l-5-4-5 4V4Z',
  info: 'M12 11v6M12 7.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  cloud: 'M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5 4.8 4.8 0 0 1 17 18H7Z',
  rain: 'M7 14a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 4.5 4.8 4.8 0 0 1 17 14H7ZM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  storm: 'M7 13a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 3.5 4.8 4.8 0 0 1 17 13H7ZM12 13l-2 4h3l-2 4',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  fog: 'M4 8h16M6 12h14M4 16h12M8 20h10',
  send: 'M4 12 20 4l-4 16-4-7-8-1Z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  check: 'M5 12.5 10 17.5 19 7',
  warn: 'M12 4 3 20h18L12 4ZM12 10v4M12 17v.01',
  fuel: 'M5 20V5h8v15M5 20h8M13 9h3l2 2v7a1.5 1.5 0 0 0 3 0V9l-3-3',
  leaf: 'M5 19C5 10 11 5 20 4c0 9-5 15-14 15ZM5 19c3-4 6-6 10-8',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3 3-5 6-5s6 2 6 5M16 11a2.5 2.5 0 1 0 0-5M17 15c2.5 0 4 1.5 4 4',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c0-3.5 3.6-6 8-6s8 2.5 8 6',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  cloudOff: 'M3 3l18 18M7 18a4 4 0 0 1-.6-7.96M10 6.2A5.5 5.5 0 0 1 17 8.5 4.8 4.8 0 0 1 19 17',
};
export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.info} />
    </svg>
  );
}