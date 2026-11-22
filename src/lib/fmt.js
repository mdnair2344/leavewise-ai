export const LEVELS = {
  low: { label: 'Free flow', css: 'low' },
  moderate: { label: 'Moderate', css: 'mod' },
  heavy: { label: 'Heavy', css: 'heavy' },
  severe: { label: 'Severe', css: 'severe' },
};
export const WEATHER_OPTIONS = [
  { key: 'clear', label: 'Clear', icon: 'sun' },
  { key: 'clouds', label: 'Cloudy', icon: 'cloud' },
  { key: 'rain', label: 'Rain', icon: 'rain' },
  { key: 'heavy_rain', label: 'Heavy rain', icon: 'storm' },
  { key: 'snow', label: 'Snow', icon: 'snow' },
  { key: 'fog', label: 'Fog', icon: 'fog' },
];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};
export const clock12 = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const hour12 = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
export const pad = (n) => String(n).padStart(2, '0');

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localNowISO(d = new Date()) {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
export const money = (v, cur = '₹') => `${cur}${Math.round(v).toLocaleString('en-IN')}`;
