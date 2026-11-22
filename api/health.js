import { route } from '../lib/http.js';
import { meta } from '../lib/model.js';
import { llmStatus } from '../lib/llm.js';
import { dbConfigured } from '../lib/db.js';
import { authEnabled } from '../lib/auth.js';
import { WEATHER, LEVELS, CAPACITY, ALPHA, BETA, IDLE_LITRES_PER_HOUR, CO2_KG_PER_LITRE } from '../lib/traffic.js';

export default route(
  async () => ({
    ok: true,
    time: new Date().toISOString(),
    llm: llmStatus(),
    database: { configured: dbConfigured() },
    auth: { enabled: authEnabled() },
    model: {
      name: meta.name, type: meta.type, source: meta.source, isSynthetic: meta.is_synthetic, dataset: meta.dataset,
      rows: meta.rows_used, from: meta.date_from, to: meta.date_to, trainedAt: meta.trained_at, split: meta.split,
      metrics: meta.metrics, capacity: CAPACITY, importances: meta.importances,
    },
    assumptions: { delayFormula: `travel = free_flow * (1 + ${ALPHA} * (volume/capacity)^${BETA})`, idleLitresPerHour: IDLE_LITRES_PER_HOUR, co2KgPerLitre: CO2_KG_PER_LITRE },
    weather: Object.entries(WEATHER).map(([key, w]) => ({ key, label: w.label })),
    levels: LEVELS.map((l) => ({ key: l.key, label: l.label, upTo: l.max === Infinity ? null : l.max })),
  }),
  { methods: ['GET'] },
);