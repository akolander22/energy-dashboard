const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { localDateDaysAgo } = require('../lib/time');

// GET /api/history?days=14
router.get('/', (req, res) => {
  const days  = parseInt(req.query.days) || 14;
  const sinceStr = localDateDaysAgo(days);

  const rows = db.prepare(`
    SELECT date, emporia_kwh AS kwh
    FROM   daily_totals
    WHERE  date >= ? AND emporia_kwh IS NOT NULL
    ORDER  BY date ASC
  `).all(sinceStr);

  res.json(rows);
});

module.exports = router;
