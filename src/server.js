require('dotenv').config();

const express   = require('express');
const path      = require('path');
const { connect } = require('./db/connection');
const scheduler   = require('./collectors/scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/stats',    require('./routes/stats'));
app.use('/api/circuits', require('./routes/circuits'));
app.use('/api/solar',    require('./routes/solar'));

// Legacy routes — keep these so the existing dashboard UI doesn't break
const emporia   = require('./connectors/emporia');
const apsystems = require('./connectors/apsystems');

app.get('/api/hourly', async (req, res) => {
  try {
    const data = emporia.isConfigured() ? await emporia.fetchHourlyToday() : null;
    res.json(data || placeholderHourly());
  } catch { res.json(placeholderHourly()); }
});

app.get('/api/history', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  try {
    const data = emporia.isConfigured() ? await emporia.fetchDailyHistory(days) : null;
    res.json(data || placeholderDaily(days));
  } catch { res.json(placeholderDaily(days)); }
});

function placeholderHourly() {
  const hours = [];
  const now = new Date();
  for (let h = 0; h <= now.getHours(); h++) {
    const base = (h >= 6 && h <= 9) ? 2.8 : (h >= 17 && h <= 21) ? 3.4 : 1.1;
    hours.push({ hour: h, label: `${String(h).padStart(2,'0')}:00`, kwh: parseFloat((base + Math.random()*0.6-0.3).toFixed(2)) });
  }
  return hours;
}

function placeholderDaily(days) {
  const result = []; const now = new Date();
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate()-i);
    const isWeekend = d.getDay()===0||d.getDay()===6;
    result.push({ date: d.toISOString().split('T')[0], kwh: parseFloat(((isWeekend?28:22)+Math.random()*8-4).toFixed(1)) });
  }
  return result;
}

async function main() {
  await connect();
  scheduler.start();
  app.listen(PORT, () => {
    console.log(`\n⚡ Energy Dashboard → http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
