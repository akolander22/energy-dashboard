const express = require('express');
const router  = express.Router();

const apsystems  = require('../connectors/apsystems');
const DailyTotal = require('../db/models/DailyTotal');

// GET /api/solar — today's production + stored history
router.get('/', async (req, res) => {
  const [today, monthly] = await Promise.all([
    apsystems.isConfigured()
      ? apsystems.fetchTodayProduction().catch(() => null)
      : Promise.resolve(null),
    apsystems.isConfigured()
      ? apsystems.fetchMonthlyHistory(3).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Also pull solar_kwh from stored daily totals for trend comparison
  const stored = await DailyTotal.find({ solar_kwh: { $ne: null } })
    .sort({ date: -1 })
    .limit(90)
    .lean();

  res.json({
    today,
    monthly,
    stored_history: stored.reverse(),
  });
});

module.exports = router;
