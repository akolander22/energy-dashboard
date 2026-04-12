const express = require('express');
const router  = express.Router();

const xcel      = require('../connectors/xcel');
const emporia   = require('../connectors/emporia');
const apsystems = require('../connectors/apsystems');
const DailyTotal = require('../db/models/DailyTotal');

const RATE_PER_KWH = parseFloat(process.env.RATE_PER_KWH || '0.13');

async function safeCall(fn, fallback, label) {
  try { return await fn(); }
  catch (err) { console.warn(`[${label}]`, err.message); return fallback; }
}

// GET /api/stats — live summary cards
router.get('/', async (req, res) => {
  const [meterData, circuitData, solarWatts] = await Promise.all([
    safeCall(() => xcel.fetchMeterReading(), { currentKw: 1.5 }, 'Xcel'),
    safeCall(() => emporia.fetchCircuitUsage(), { circuits: [], totalKw: 2.4 }, 'Emporia'),
    safeCall(() => apsystems.fetchCurrentWatts(), 0, 'APSystems'),
  ]);

  const currentKw = meterData.currentKw ?? circuitData.totalKw ?? 0;
  const solarKw   = parseFloat((solarWatts / 1000).toFixed(2));
  const netKw     = parseFloat((currentKw - solarKw).toFixed(2));

  // Pull today's stored daily total for cost context
  const today = new Date().toISOString().split('T')[0];
  const todayStored = await DailyTotal.findOne({ date: today }).lean();

  res.json({
    currentKw,
    solarKw,
    netKw,
    todayKwh:   todayStored?.emporia_kwh ?? todayStored?.xcel_daily_kwh ?? null,
    todayCost:  todayStored?.emporia_kwh
      ? parseFloat((todayStored.emporia_kwh * RATE_PER_KWH).toFixed(2))
      : null,
    ratePerKwh: RATE_PER_KWH,
    sources: {
      xcel:      xcel.isConfigured()      ? 'live' : 'placeholder',
      emporia:   emporia.isConfigured()    ? 'live' : 'placeholder',
      apsystems: apsystems.isConfigured()  ? 'live' : 'placeholder',
    },
  });
});

// GET /api/stats/daily?days=30 — stored daily totals from Mongo
router.get('/daily', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const totals = await DailyTotal.find({ date: { $gte: sinceStr } })
    .sort({ date: 1 })
    .lean();

  res.json(totals);
});

// GET /api/status — connector health
router.get('/status', (req, res) => {
  res.json({
    xcel:      { configured: xcel.isConfigured(),      label: 'Xcel Itron Meter' },
    emporia:   { configured: emporia.isConfigured(),    label: 'Emporia Vue' },
    apsystems: { configured: apsystems.isConfigured(),  label: 'APSystems EMA (Solar)' },
  });
});

module.exports = router;
