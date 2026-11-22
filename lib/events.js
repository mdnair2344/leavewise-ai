// Event impact model: baseline traffic (ML forecast) + extra vehicles from the crowd, minus lost capacity from closures.
// Every constant below is a documented PLANNING ASSUMPTION - tune them for a real venue.
import { forecastDay, levelOf, LEVELS } from './traffic.js';
import { clamp, round, hhmm, clock12, hourLabel } from './util.js';

export const CLOSURE = {
  none: { label: 'No closure', capacityLoss: 0 },
  lane: { label: 'One lane closed', capacityLoss: 0.25 },
  major: { label: 'Road / major closure', capacityLoss: 0.5 },
};
export const ARRIVE_SHARE = [0.5, 0.3, 0.2]; // share of car arrivals 1h, 2h, 3h before start
export const LEAVE_SHARE = [0.5, 0.3, 0.2]; // share of car departures in 1st, 2nd, 3rd hour after end

function surgeByHour({ startMin, endMin, attendance, carShare, occupancy }) {
  const cars = (attendance * carShare) / occupancy;
  const extra = new Array(24).fill(0);
  const sh = Math.floor(startMin / 60);
  const eh = Math.round(endMin / 60);
  ARRIVE_SHARE.forEach((s, i) => {
    const h = sh - 1 - i;
    if (h >= 0) extra[h] += cars * s;
  });
  LEAVE_SHARE.forEach((s, i) => {
    const h = eh + i;
    if (h <= 23) extra[h] += cars * s;
  });
  return { extra, cars };
}

function evaluate(day, p) {
  const { extra, cars } = surgeByHour(p);
  const cap = day.capacity * (1 - CLOSURE[p.closure].capacityLoss); // already weather-adjusted
  const hours = day.hours.map((h) => {
    const ratio = (h.volume + extra[h.hour]) / cap;
    return {
      hour: h.hour, baselineVolume: h.volume, extraVehicles: Math.round(extra[h.hour]),
      baselineRatio: h.ratio, ratio: round(ratio, 3), level: levelOf(ratio).key,
    };
  });
  const active = hours.filter((h) => h.extraVehicles > 0);
  const peak = active.length ? active.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : hours[0];
  return { hours, peak, cars: Math.round(cars), effectiveCapacity: Math.round(cap) };
}

export function estimateEvent(date, cond, p) {
  const day = forecastDay(date, cond);
  const main = evaluate(day, p);
  const peak = main.peak;
  const level = levelOf(peak.ratio);

  // What-if scenarios the organiser can act on
  const scenarios = [];
  const shuttle = evaluate(day, { ...p, carShare: p.carShare * 0.7 });
  scenarios.push({ key: 'shuttle', label: 'Add shuttles / ride-share (30% fewer car trips)', peakRatio: round(shuttle.peak.ratio, 2), level: levelOf(shuttle.peak.ratio).key });
  if (p.closure !== 'none') {
    const open = evaluate(day, { ...p, closure: 'none' });
    scenarios.push({ key: 'no_closure', label: 'Keep all lanes open', peakRatio: round(open.peak.ratio, 2), level: levelOf(open.peak.ratio).key });
  }
  // Best start time within +-3h (shifting the whole event)
  let best = { shift: 0, ratio: peak.ratio };
  for (let shift = -180; shift <= 180; shift += 60) {
    const s = p.startMin + shift;
    const e = p.endMin + shift;
    if (s < 4 * 60 || e > 23 * 60 + 30) continue;
    const r = evaluate(day, { ...p, startMin: s, endMin: e }).peak.ratio;
    if (r < best.ratio - 0.005) best = { shift, ratio: r };
  }
  const bestStart = best.shift !== 0
    ? { startTime: hhmm(p.startMin + best.shift), startDisplay: clock12(p.startMin + best.shift), peakRatio: round(best.ratio, 2), level: levelOf(best.ratio).key }
    : null;

  // Resource heuristics (planning guidance only, not official deployment norms)
  const extraPeak = Math.max(...main.hours.map((h) => h.extraVehicles));
  const lossBonus = { none: 0, lane: 2, major: 4 }[p.closure];
  const levelBoost = { low: 0, moderate: 1, heavy: 2, severe: 4 }[level.key];
  const plan = {
    trafficPolice: Math.max(2, Math.ceil(extraPeak / 250) + lossBonus + levelBoost),
    marshals: Math.max(2, Math.ceil(p.attendance / 800)),
    barricades: Math.max(0, Math.ceil(extraPeak / 600) + (p.closure === 'none' ? 0 : 6)),
    diversion: { low: 'Normal monitoring', moderate: 'Signage and partial diversion near junctions', heavy: 'Activate alternate route and timed signals', severe: 'Full diversion plan, public advisory, and park-and-ride' }[level.key],
  };

  return {
    date, dow: day.dow,
    event: { attendance: p.attendance, start: hhmm(p.startMin), startDisplay: clock12(p.startMin), end: hhmm(p.endMin), endDisplay: clock12(p.endMin), closure: p.closure, closureLabel: CLOSURE[p.closure].label, carShare: p.carShare, occupancy: p.occupancy },
    carTrips: main.cars, effectiveCapacity: main.effectiveCapacity,
    peak: {
      hour: peak.hour, hourDisplay: hourLabel(peak.hour), ratio: round(peak.ratio, 2), level: level.key, levelLabel: level.label,
      baselineRatio: peak.baselineRatio, amplification: round(peak.ratio / Math.max(peak.baselineRatio, 0.05), 2), extraVehicles: peak.extraVehicles,
    },
    hours: main.hours, scenarios, bestStart, plan, levels: LEVELS.map((l) => l.key),
  };
}

export function parseEventParams({ attendance, startMin, endMin, closure, carShare, occupancy }) {
  return {
    attendance: clamp(Math.round(attendance), 50, 500000),
    startMin, endMin: Math.max(endMin, startMin + 30),
    closure: CLOSURE[closure] ? closure : 'none',
    carShare: clamp(carShare, 0.05, 0.95),
    occupancy: clamp(occupancy, 1, 6),
  };
}
