// Runs the exported gradient-boosting model (trained by ml/train.py) in plain JavaScript,
// and explains single predictions with exact Shapley values over feature groups.
import model from './data/model.generated.js';

export const meta = model.meta;
const { trees, offset, lr } = model;

function walk(t, x) {
  let n = 0;
  while (t.f[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n];
  return t.v[n];
}

/** Raw model output (vehicles / hour) for one feature row (order = meta.features). */
export function predictRaw(x) {
  let s = offset;
  for (let i = 0; i < trees.length; i++) s += lr * walk(trees[i], x);
  return s;
}
export const predict = (x) => Math.max(0, predictRaw(x));

/** 80% prediction interval multipliers for a predicted volume (from held-out residuals). */
export function interval(volume) {
  const u = meta.uncertainty.find((b) => volume < b.max) || meta.uncertainty[meta.uncertainty.length - 1];
  return { lo: u.lo, hi: u.hi };
}

// ---------- Shapley (interventional, exact over 5 feature groups) ----------
const GROUP_KEYS = Object.keys(meta.groups);
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));

/**
 * Splits (prediction - average prediction) into contributions per group:
 * time_of_day, day_of_week, season, weather, holiday. Contributions sum exactly to the difference.
 */
export function shapley(x) {
  const n = GROUP_KEYS.length;
  const bg = meta.background;
  const value = new Array(1 << n);
  for (let mask = 0; mask < 1 << n; mask++) {
    let total = 0;
    for (const b of bg) {
      const row = b.slice();
      for (let g = 0; g < n; g++) {
        if (mask & (1 << g)) for (const idx of meta.groups[GROUP_KEYS[g]]) row[idx] = x[idx];
      }
      total += predictRaw(row);
    }
    value[mask] = total / bg.length;
  }
  const contrib = {};
  for (let g = 0; g < n; g++) {
    let phi = 0;
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << g)) continue;
      const s = popcount(mask);
      phi += ((fact(s) * fact(n - s - 1)) / fact(n)) * (value[mask | (1 << g)] - value[mask]);
    }
    contrib[GROUP_KEYS[g]] = phi;
  }
  return { base: value[0], prediction: value[(1 << n) - 1], contributions: contrib };
}
function popcount(v) {
  let c = 0;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}
