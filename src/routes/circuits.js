const express = require('express');
const router  = express.Router();

const emporia        = require('../connectors/emporia');
const Circuit        = require('../db/models/Circuit');
const CircuitReading = require('../db/models/CircuitReading');

// GET /api/circuits — current live circuit snapshot + registry
router.get('/', async (req, res) => {
  // Live snapshot from Emporia if available
  let live = null;
  if (emporia.isConfigured()) {
    try {
      const data = await emporia.fetchCircuitUsage();
      live = data.circuits;
    } catch (err) {
      console.warn('[routes/circuits] Live fetch failed:', err.message);
    }
  }

  // Registry with averages from Mongo
  const registry = await Circuit.find().sort({ is_active: -1, avg_kw: -1 }).lean();

  // Compute unknown draw from latest snapshot
  const main = live?.find(c => c.isMain);
  const monitoredSum = live?.filter(c => !c.isMain).reduce((s, c) => s + c.kw, 0) ?? null;
  const unknown = (main && monitoredSum !== null)
    ? parseFloat((main.kw - monitoredSum).toFixed(3))
    : null;

  res.json({
    live,          // current kW per circuit (null if Emporia not configured)
    registry,      // all known circuits with averages
    summary: {
      total_kw:     main?.kw ?? null,
      monitored_kw: monitoredSum,
      unknown_kw:   unknown,
      monitored_pct: (main && monitoredSum !== null)
        ? parseFloat(((monitoredSum / main.kw) * 100).toFixed(1))
        : null,
    },
  });
});

// GET /api/circuits/:channelNum/history?hours=24
// Time-series readings for a specific circuit
router.get('/:channelNum/history', async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const readings = await CircuitReading.find({
    channel_num: req.params.channelNum,
    timestamp:   { $gte: since },
  }).sort({ timestamp: 1 }).lean();

  res.json(readings);
});

// GET /api/circuits/averages — all circuits sorted by avg draw
// Useful for understanding where power goes across rotation cycles
router.get('/averages', async (req, res) => {
  const circuits = await Circuit.find({ avg_kw: { $ne: null } })
    .sort({ avg_kw: -1 })
    .lean();

  const totalAvg = circuits
    .filter(c => c.channel_num !== '1,2,3')
    .reduce((s, c) => s + (c.avg_kw || 0), 0);

  const main = circuits.find(c => c.channel_num === '1,2,3');

  res.json({
    circuits,
    total_monitored_avg_kw: parseFloat(totalAvg.toFixed(3)),
    main_avg_kw: main?.avg_kw ?? null,
    unknown_avg_kw: main?.avg_kw != null
      ? parseFloat((main.avg_kw - totalAvg).toFixed(3))
      : null,
  });
});

// PATCH /api/circuits/:channelNum — update circuit metadata (name, breaker_number, notes)
router.patch('/:channelNum', async (req, res) => {
  const allowed = ['name', 'breaker_number', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const circuit = await Circuit.findOneAndUpdate(
    { channel_num: req.params.channelNum },
    { $set: updates },
    { new: true }
  );

  if (!circuit) return res.status(404).json({ error: 'Circuit not found' });
  res.json(circuit);
});

module.exports = router;
