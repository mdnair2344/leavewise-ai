// Domain logic: weather presets, forecasting a day, travel-time model, departure planner, week planner.
import { meta, predict, interval, shapley } from './model.js';
import { clamp, round, dowOf, monthOf, addDays, weekStart, dowName, hhmm, clock12, hourLabel, DOW_NAMES } from './util.js';

export const CAPACITY = meta.capacity; // vehicles/hour treated as "full" (98th percentile of history)

// `cap` = share of normal road capacity left in that weather. These are planning assumptions in the spirit of
// road-weather capacity adjustments (e.g. FHWA / Highway Capacity Manual) - the volume model itself cannot learn
// capacity loss because it only sees how many cars passed, not how slowly they moved. Tune as needed.
export const WEATHER = {
  clear: { label: 'Clear', cap: 1, rain: 0, snow: 0, clouds: 5, flag: null },
  clouds: { label: 'Cloudy', cap: 1, rain: 0, snow: 0, clouds: 75, flag: 'w_clouds' },
  rain: { label: 'Rain', cap: 0.95, rain: 1.5, snow: 0, clouds: 90, flag: 'w_rain' },
  heavy_rain: { label: 'Heavy rain', cap: 0.86, rain: 8, snow: 0, clouds: 95, flag: 'w_rain' },
  snow: { label: 'Snow', cap: 0.85, rain: 0, snow: 0.3, clouds: 92, flag: 'w_snow' },
  fog: { label: 'Fog / haze', cap: 0.92, rain: 0, snow: 0, clouds: 90, flag: 'w_fog' },
};
export const WEATHER_KEYS = Object.keys(WEATHER);

// ---------- congestion levels & travel-time model ----------
export const LEVELS = [
  { key: 'low', label: 'Free flow', max: 0.5 },
  { key: 'moderate', label: 'Moderate', max: 0.8 },
  { key: 'heavy', label: 'Heavy', max: 0.92 },
  { key: 'severe', label: 'Severe', max: Infinity },
];
export const levelOf = (ratio) => LEVELS.find((l) => ratio < l.max);

// BPR-style delay: travel_time = free_flow * (1 + ALPHA * (volume/capacity)^BETA).
// ALPHA/BETA are tunable planning assumptions (urban arterial feel), not fitted from this dataset.
export const ALPHA = 0.8;
export const BETA = 3;
export const delayFactor = (ratio) => 1 + ALPHA * Math.pow(clamp(ratio, 0, 1.6), BETA);

// Planning assumptions for cost estimates (shown to the user, editable via request params)
export const IDLE_LITRES_PER_HOUR = 0.9;
export const CO2_KG_PER_LITRE = 2.31; // petrol
export function delayCost(extraMin, { pricePerL = 100, tripsPerWeek = 10 } = {}) {
  const litres = (Math.max(0, extraMin) / 60) * IDLE_LITRES_PER_HOUR;
  return {
    extraMin: round(extraMin, 1),
    litres: round(litres, 2),
    co2kg: round(litres * CO2_KG_PER_LITRE, 2),
    money: round(litres * pricePerL, 1),
    weekly: {
      extraMin: round(extraMin * tripsPerWeek, 0),
      litres: round(litres * tripsPerWeek, 1),
      co2kg: round(litres * CO2_KG_PER_LITRE * tripsPerWeek, 1),
      money: round(litres * pricePerL * tripsPerWeek, 0),
    },
  };
}

// ---------- features ----------
export function conditions(p = {}) {
  const weather = WEATHER[p.weather] ? p.weather : 'clear';
  return { weather, tempC: Number.isFinite(p.tempC) ? p.tempC : 18, holiday: !!p.holiday };
}

export function featureRow(date, hour, c) {
  const w = WEATHER[c.weather];
  const f = {
    hour,
    dow: dowOf(date),
    month: monthOf(date),
    is_holiday: c.holiday ? 1 : 0,
    temp_c: c.tempC,
    rain_mm: w.rain,
    snow_mm: w.snow,
    clouds: w.clouds,
    w_clouds: 0,
    w_rain: 0,
    w_snow: 0,
    w_fog: 0,
  };
  if (w.flag) f[w.flag] = 1;
  return meta.features.map((k) => f[k]);
}

// ---------- one day ----------
export const capacityFor = (c) => CAPACITY * WEATHER[c.weather].cap;

export function forecastDay(date, cond) {
  const c = conditions(cond);
  const cap = capacityFor(c);
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const volume = predict(featureRow(date, h, c));
    const iv = interval(volume);
    const ratio = volume / cap;
    hours.push({
      hour: h,
      volume: Math.round(volume),
      ratio: round(ratio, 3),
      hiRatio: round((volume * iv.hi) / cap, 3),
      loRatio: round((volume * iv.lo) / cap, 3),
      level: levelOf(ratio).key,
      delay: round(delayFactor(ratio), 3),
    });
  }
  const daytime = hours.filter((h) => h.hour >= 5 && h.hour <= 22);
  const peak = daytime.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const calm = daytime.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return { date, dow: dowName(date), conditions: c, hours, peakHour: peak.hour, peakRatio: peak.ratio, calmHour: calm.hour, capacity: Math.round(cap) };
}

/** Why is this hour busy? Shapley contributions + human labels. */
export function explainHour(date, hour, cond) {
  const c = conditions(cond);
  const x = featureRow(date, hour, c);
  const s = shapley(x);
  const labels = {
    time_of_day: `Time of day (${hourLabel(hour)})`,
    day_of_week: `Day of week (${dowName(date)})`,
    season: `Season & temperature (${Math.round(c.tempC)}°C)`,
    weather: `Weather (${WEATHER[c.weather].label.toLowerCase()})`,
    holiday: c.holiday ? 'Public holiday / event day' : 'Not a holiday',
  };
  const items = Object.entries(s.contributions)
    .map(([key, v]) => ({ key, label: labels[key], vehicles: Math.round(v), shareOfCapacity: round(v / CAPACITY, 3) }))
    .sort((a, b) => Math.abs(b.vehicles) - Math.abs(a.vehicles));
  const pred = Math.max(0, s.prediction);
  const cap = capacityFor(c);
  return {
    date, hour, conditions: c,
    averageVolume: Math.round(s.base),
    predictedVolume: Math.round(pred),
    ratio: round(pred / cap, 3),
    level: levelOf(pred / cap).key,
    capacityLossPercent: Math.round((1 - WEATHER[c.weather].cap) * 100),
    contributions: items,
  };
}

// ---------- departure planner ----------
function ratioAt(day, minute) {
  const c = (minute - 30) / 60; // hour h is centred at h:30
  const i0 = Math.floor(c);
  const f = c - i0;
  const a = day.hours[clamp(i0, 0, 23)];
  const b = day.hours[clamp(i0 + 1, 0, 23)];
  const mix = (k) => a[k] * (1 - f) + b[k] * f;
  return { ratio: mix('ratio'), hi: mix('hiRatio') };
}

export function tripTime(day, depMin, freeFlowMin) {
  const r0 = ratioAt(day, depMin);
  const t0 = freeFlowMin * delayFactor(r0.ratio);
  const r = ratioAt(day, depMin + t0 / 2); // traffic at the middle of the trip
  const mean = freeFlowMin * delayFactor(r.ratio);
  const p90 = freeFlowMin * delayFactor(r.hi);
  return { mean, p90, ratio: r.ratio, level: levelOf(r.ratio).key };
}

/**
 * Latest departure that still arrives on time 9 days out of 10, plus the fastest nearby alternative.
 * All times are minutes after midnight.
 */
export function planDeparture(day, { freeFlowMin, arriveBy, bufferMin = 5, nowMin = null, cost = {} }) {
  let rec = null;
  for (let d = Math.min(1439, arriveBy - 1); d >= 0; d--) {
    const t = tripTime(day, d, freeFlowMin);
    if (d + t.p90 + bufferMin <= arriveBy) {
      rec = { leaveMin: d, ...t };
      break;
    }
  }
  const fmt = (leaveMin, t) => ({
    leave: hhmm(leaveMin), leaveDisplay: clock12(leaveMin),
    arrive: hhmm(leaveMin + t.mean), arriveDisplay: clock12(leaveMin + t.mean),
    travelMin: round(t.mean, 0), p90Min: round(t.p90, 0), extraMin: round(t.mean - freeFlowMin, 0),
    level: t.level, ratio: round(t.ratio, 2),
  });

  let fastest = null;
  if (rec) {
    let best = rec;
    for (let d = rec.leaveMin; d >= Math.max(0, rec.leaveMin - 90); d -= 5) {
      const t = tripTime(day, d, freeFlowMin);
      if (t.mean < best.mean - 0.01) best = { leaveMin: d, ...t };
    }
    const savedMin = rec.mean - best.mean;
    if (best.leaveMin !== rec.leaveMin && savedMin >= 4) {
      fastest = { ...fmt(best.leaveMin, best), savedMin: round(savedMin, 0), leaveEarlierBy: rec.leaveMin - best.leaveMin };
    }
  }

  let now = null;
  if (nowMin !== null && nowMin < arriveBy) {
    const t = tripTime(day, nowMin, freeFlowMin);
    const late = nowMin + t.p90 + bufferMin - arriveBy;
    now = { ...fmt(nowMin, t), minutesLateAtP90: Math.max(0, round(late, 0)), onTime: late <= 0 };
  }

  const slots = [];
  const from = Math.max(0, arriveBy - 240);
  const to = Math.min(1439, arriveBy + 30);
  for (let d = from; d <= to; d += 10) {
    const t = tripTime(day, d, freeFlowMin);
    slots.push({ t: d, leave: hhmm(d), travelMin: round(t.mean, 1), p90Min: round(t.p90, 1), arriveMin: round(d + t.mean, 0), level: t.level });
  }
  const worst = slots.reduce((a, b) => (b.travelMin > a.travelMin ? b : a), slots[0]);

  const recommended = rec ? fmt(rec.leaveMin, rec) : null;
  return {
    date: day.date, dow: day.dow, freeFlowMin, arriveBy: hhmm(arriveBy), arriveByDisplay: clock12(arriveBy), bufferMin,
    recommended, fastest, now, slots,
    worstSlot: worst ? { leave: worst.leave, travelMin: worst.travelMin } : null,
    cost: recommended ? delayCost(recommended.extraMin, cost) : null,
    feasible: !!rec,
  };
}

// ---------- week ----------
export function planWeek(startDate, cond, { freeFlowMin, arriveBy, leaveWorkAt, bufferMin = 5, cost = {}, holidays = [] }) {
  const monday = weekStart(startDate);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const day = forecastDay(date, { ...cond, holiday: cond.holiday || holidays.includes(date) });
    const out = planDeparture(day, { freeFlowMin, arriveBy, bufferMin, cost });
    const back = tripTime(day, leaveWorkAt, freeFlowMin);
    const outExtra = out.recommended ? out.recommended.extraMin : 0;
    const delayMin = round(outExtra + (back.mean - freeFlowMin), 0);
    days.push({
      date, dow: DOW_NAMES[i], isWeekend: i >= 5,
      ratios: day.hours.map((h) => h.ratio),
      outbound: out.recommended,
      ret: { leave: hhmm(leaveWorkAt), leaveDisplay: clock12(leaveWorkAt), travelMin: round(back.mean, 0), level: back.level },
      delayMin, peakHour: day.peakHour, peakRatio: day.peakRatio,
    });
  }
  const work = days.filter((d) => !d.isWeekend);
  const best = work.reduce((a, b) => (b.delayMin < a.delayMin ? b : a));
  const worst = work.reduce((a, b) => (b.delayMin > a.delayMin ? b : a));
  const totalDelay = work.reduce((s, d) => s + d.delayMin, 0);
  return {
    weekStart: monday, freeFlowMin, arriveBy: hhmm(arriveBy), leaveWorkAt: hhmm(leaveWorkAt),
    days, bestDay: { date: best.date, dow: best.dow, delayMin: best.delayMin }, worstDay: { date: worst.date, dow: worst.dow, delayMin: worst.delayMin },
    totalDelayMin: totalDelay,
    weeklyCost: delayCost(totalDelay / (2 * work.length), { ...cost, tripsPerWeek: 2 * work.length }), // totalDelay = both legs of every workday; delayCost wants minutes PER TRIP
    savingIfWorstDayFlexible: Math.max(0, worst.delayMin - best.delayMin),
  };
}
