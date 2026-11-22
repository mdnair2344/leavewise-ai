import { route, readConditions } from '../lib/http.js';
import { forecastDay } from '../lib/traffic.js';

// POST { date, weather, tempC, holiday } -> 24 hourly congestion forecasts
export default route(async (b) => {
  const { date, cond } = readConditions(b);
  return forecastDay(date, cond);
});
