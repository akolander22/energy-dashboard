const express = require('express');
const router  = express.Router();
const db      = require('../db');
const emporia = require('../connectors/emporia');

async function safeCall(fn, fallback, label) {
  try { return await fn(); }
  catch (err) { console.warn(`[${label}]`, err.message); return fallback; }
}

// GET /api/circuits — live circuit breakdown
router.get('/', async (req, res) => {
  const usage = await safeCall(() => emporia.getInstantUsage(), null, 'Emporia-circuits');
  if (!usage) {
    return res.json({ live: [], summary: { total_kw: 0, monitored_pct: 0 } });
  }
  res.json({ live: usage.circuits, summary: usage.summary });
});

// GET /api/circuits/averages — 7-day averages from stored snapshots
router.get('/averages', (req, res) => {
  const rows = db.prepare(`
    SELECT channel_num, name,
           ROUND(AVG(kw), 3) AS avg_kw,
           COUNT(*)          AS reading_count
    FROM   circuit_snapshots
    WHERE  recorded_at >= datetime('now', 'localtime', '-7 days')
    GROUP  BY channel_num
    ORDER  BY avg_kw DESC
  `).all();

  const main = rows.find(r => r.channel_num === '1,2,3');
  const subs = rows.filter(r => r.channel_num !== '1,2,3' && r.channel_num !== 'Balance');

  res.json({
    circuits:               rows,
    main_avg_kw:            main?.avg_kw ?? null,
    total_monitored_avg_kw: parseFloat(subs.reduce((s, r) => s + (r.avg_kw ?? 0), 0).toFixed(3)),
  });
});

module.exports = router;
