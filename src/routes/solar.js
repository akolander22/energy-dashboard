const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const apsystems = require('../connectors/apsystems');

async function safeCall(fn, fallback, label) {
  try { return await fn(); }
  catch (err) { console.warn(`[${label}]`, err.message); return fallback; }
}

// GET /api/solar
router.get('/', async (req, res) => {
  const today  = new Date().toISOString().split('T')[0];
  const liveWh = await safeCall(() => apsystems.fetchTodayWh(), null, 'APSystems-solar');

  if (liveWh != null) {
    return res.json({ today: { totalWh: liveWh } });
  }

  // Fall back to last stored value for today
  const stored = db.prepare('SELECT solar_wh FROM daily_totals WHERE date = ?').get(today);
  res.json({ today: stored?.solar_wh != null ? { totalWh: stored.solar_wh } : null });
});

module.exports = router;
