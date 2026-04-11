/**
 * Energy Dashboard — Server
 *
 * Data sources (each falls back to placeholder data if not configured):
 *   1. Xcel Itron meter  → src/connectors/xcel.js      (real-time kW draw, local network)
 *   2. Emporia Vue       → src/connectors/emporia.js    (circuit breakdown, cloud API)
 *   3. APSystems EMA     → src/connectors/apsystems.js  (solar production, cloud API)
 *
 * Configure via .env — see each connector file for required variables.
 * Any connector that isn't configured yet uses realistic placeholder data
 * so the dashboard always renders.
 */

require('dotenv').config();

const express = require('express');
const path    = require('path');

const xcel      = require('./connectors/xcel');
const emporia   = require('./connectors/emporia');
const apsystems = require('./connectors/apsystems');

const app  = express();
const PORT = process.env.PORT || 3000;
const RATE_PER_KWH = parseFloat(process.env.RATE_PER_KWH || '0.13');

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ---------------------------------------------------------------------------
// Placeholder generators (used when a connector isn't configured yet)
// ---------------------------------------------------------------------------

function placeholderHourly() {
  const hours = [];
  const now = new Date();
  for (let h = 0; h <= now.getHours(); h++) {
    const base = (h >= 6 && h <= 9) ? 2.8 : (h >= 17 && h <= 21) ? 3.4 : 1.1;
    hours.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      kwh: parseFloat((base + Math.random() * 0.6 - 0.3).toFixed(2)),
      source: 'placeholder',
    });
  }
  return hours;
}

function placeholderDaily(days = 30) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    result.push({
      date: d.toISOString().split('T')[0],
      kwh: parseFloat(((isWeekend ? 28 : 22) + Math.random() * 8 - 4).toFixed(1)),
      source: 'placeholder',
    });
  }
  return result;
}

function placeholderCircuits() {
  return [
    { name: 'Main',     kw: 2.4,  isMain: true,  source: 'placeholder' },
    { name: 'HVAC',     kw: 0.9,  isMain: false, source: 'placeholder' },
    { name: 'Kitchen',  kw: 0.4,  isMain: false, source: 'placeholder' },
    { name: 'Office',   kw: 0.3,  isMain: false, source: 'placeholder' },
    { name: 'Garage',   kw: 0.2,  isMain: false, source: 'placeholder' },
    { name: 'Basement', kw: 0.15, isMain: false, source: 'placeholder' },
  ];
}

function placeholderSolar() {
  const h = new Date().getHours();
  const watts = (h >= 7 && h <= 19)
    ? Math.max(0, Math.sin(Math.PI * (h - 7) / 12) * 4200 + (Math.random() * 400 - 200))
    : 0;
  return { watts: parseFloat(watts.toFixed(0)), source: 'placeholder' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeCall(fn, fallback, label) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[${label}] ${err.message} — using placeholder`);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/status — which connectors are live vs. placeholder */
app.get('/api/status', (req, res) => {
  res.json({
    xcel:      { configured: xcel.isConfigured(),     label: 'Xcel Itron Meter' },
    emporia:   { configured: emporia.isConfigured(),   label: 'Emporia Vue' },
    apsystems: { configured: apsystems.isConfigured(), label: 'APSystems EMA (Solar)' },
  });
});

/** GET /api/stats — unified summary card data */
app.get('/api/stats', async (req, res) => {
  const [meterData, circuitData, solarData, hourlyData, dailyData] = await Promise.all([
    safeCall(
      () => xcel.fetchMeterReading(),
      { currentKw: parseFloat((1.2 + Math.random() * 1.8).toFixed(2)) },
      'Xcel'
    ),
    safeCall(
      () => emporia.fetchCircuitUsage(),
      { circuits: placeholderCircuits(), totalKw: 2.4 },
      'Emporia'
    ),
    safeCall(
      () => apsystems.fetchCurrentWatts().then(w => ({ watts: w, source: 'live' })),
      placeholderSolar(),
      'APSystems'
    ),
    safeCall(
      () => emporia.isConfigured() ? emporia.fetchHourlyToday() : Promise.resolve(null),
      null, 'Emporia-hourly'
    ),
    safeCall(
      () => emporia.isConfigured() ? emporia.fetchDailyHistory(30) : Promise.resolve(null),
      null, 'Emporia-daily'
    ),
  ]);

  const hourly = hourlyData || placeholderHourly();
  const daily  = dailyData  || placeholderDaily(30);

  const currentKw = meterData.currentKw ?? circuitData.totalKw ?? 0;
  const todayKwh  = parseFloat(hourly.reduce((s, h) => s + (h.kwh ?? h.kw ?? 0), 0).toFixed(1));
  const monthKwh  = parseFloat(daily.reduce((s, d) => s + d.kwh, 0).toFixed(1));
  const avgDaily  = parseFloat((monthKwh / daily.length).toFixed(1));
  const solarKw   = parseFloat(((solarData.watts || 0) / 1000).toFixed(2));
  const netKw     = parseFloat((currentKw - solarKw).toFixed(2));

  res.json({
    currentKw, solarKw, netKw,
    todayKwh,
    todayCost:          parseFloat((todayKwh * RATE_PER_KWH).toFixed(2)),
    monthKwh,
    monthCost:          parseFloat((monthKwh * RATE_PER_KWH).toFixed(2)),
    avgDailyKwh:        avgDaily,
    projectedMonthKwh:  parseFloat((avgDaily * 30).toFixed(1)),
    projectedMonthCost: parseFloat((avgDaily * 30 * RATE_PER_KWH).toFixed(2)),
    ratePerKwh:         RATE_PER_KWH,
    sources: {
      meter:   xcel.isConfigured()      ? 'live' : 'placeholder',
      emporia: emporia.isConfigured()    ? 'live' : 'placeholder',
      solar:   apsystems.isConfigured()  ? 'live' : 'placeholder',
    },
  });
});

/** GET /api/hourly — hour-by-hour consumption today */
app.get('/api/hourly', async (req, res) => {
  const data = await safeCall(
    () => emporia.isConfigured() ? emporia.fetchHourlyToday() : Promise.resolve(null),
    null, 'Emporia-hourly'
  );
  res.json(data || placeholderHourly());
});

/** GET /api/history?days=30 — daily kWh for past N days */
app.get('/api/history', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await safeCall(
    () => emporia.isConfigured() ? emporia.fetchDailyHistory(days) : Promise.resolve(null),
    null, 'Emporia-history'
  );
  res.json(data || placeholderDaily(days));
});

/** GET /api/circuits — per-circuit breakdown from Emporia */
app.get('/api/circuits', async (req, res) => {
  const data = await safeCall(
    () => emporia.fetchCircuitUsage(),
    { circuits: placeholderCircuits() },
    'Emporia-circuits'
  );
  res.json(data.circuits);
});

/** GET /api/solar — today's solar time-series + monthly history */
app.get('/api/solar', async (req, res) => {
  const [today, monthly] = await Promise.all([
    safeCall(() => apsystems.fetchTodayProduction(), { times: [], power: [], totalWh: 0 }, 'APSystems-today'),
    safeCall(() => apsystems.fetchMonthlyHistory(3),  [], 'APSystems-monthly'),
  ]);
  res.json({ today, monthly });
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n⚡ Energy Dashboard → http://localhost:${PORT}`);
  console.log(`\nConnector status:`);
  console.log(`  Xcel meter  : ${xcel.isConfigured()      ? '✓ live' : '○ placeholder  (set XCEL_METER_IP + certs)'}`);
  console.log(`  Emporia Vue : ${emporia.isConfigured()    ? '✓ live' : '○ placeholder  (set EMPORIA_EMAIL + EMPORIA_PASSWORD)'}`);
  console.log(`  APSystems   : ${apsystems.isConfigured()  ? '✓ live' : '○ placeholder  (set APSYSTEMS_ECU_ID)'}\n`);
});
