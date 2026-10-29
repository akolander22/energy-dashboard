const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const { localDate, localDateDaysAgo } = require('../lib/time');
const xcel      = require('../connectors/xcel');
const emporia   = require('../connectors/emporia');
const apsystems = require('../connectors/apsystems');

const RATE_PER_KWH = parseFloat(process.env.RATE_PER_KWH || '0.13');

async function safeCall(fn, fallback, label) {
  try { return await fn(); }
  catch (err) { console.warn(`[${label}]`, err.message); return fallback; }
}

// GET /api/stats — live summary cards
router.get('/', async (req, res) => {
  const [usage, solarWatts] = await Promise.all([
    safeCall(() => emporia.getInstantUsage(), null, 'Emporia'),
    safeCall(() => apsystems.fetchCurrentWatts(), 0, 'APSystems'),
  ]);

  const currentKw = usage?.totalKw ?? 0;
  const solarKw   = parseFloat((solarWatts / 1000).toFixed(2));
  const netKw     = parseFloat((currentKw - solarKw).toFixed(2));

  const today       = localDate();
  const todayStored = db.prepare('SELECT * FROM daily_totals WHERE date = ?').get(today);

  res.json({
    currentKw,
    solarKw,
    netKw,
    todayKwh:   todayStored?.emporia_kwh ?? null,
    todayCost:  todayStored?.emporia_kwh != null
      ? parseFloat((todayStored.emporia_kwh * RATE_PER_KWH).toFixed(2))
      : null,
    ratePerKwh: RATE_PER_KWH,
    sources: {
      xcel:      xcel.isConfigured()     ? 'live' : 'placeholder',
      emporia:   emporia.isConfigured()   ? 'live' : 'placeholder',
      apsystems: apsystems.isConfigured() ? 'live' : 'placeholder',
    },
  });
});

// GET /api/stats/daily?days=30 — stored daily totals
router.get('/daily', (req, res) => {
  const days  = parseInt(req.query.days) || 30;
  const sinceStr = localDateDaysAgo(days);
  const totals = db.prepare(
    'SELECT * FROM daily_totals WHERE date >= ? ORDER BY date ASC'
  ).all(sinceStr);
  res.json(totals);
});

// GET /api/stats/status — connector health
router.get('/status', (req, res) => {
  res.json({
    xcel:      { configured: xcel.isConfigured(),     label: 'Xcel Itron Meter' },
    emporia:   { configured: emporia.isConfigured(),   label: 'Emporia Vue' },
    apsystems: { configured: apsystems.isConfigured(), label: 'APSystems (Solar)' },
  });
});

module.exports = router;
