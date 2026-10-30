// Nightly ntfy summary: kWh used, solar produced, net from the grid, cost,
// and the three circuits that used the most today.
// Sent at DAILY_SUMMARY_HOUR (default 21, local time). DAILY_SUMMARY=off disables it.

const db        = require('../db');
const emporia   = require('../connectors/emporia');
const apsystems = require('../connectors/apsystems');
const ntfy      = require('../lib/ntfy');
const { localDate } = require('../lib/time');

const RATE_PER_KWH = parseFloat(process.env.RATE_PER_KWH || '0.13');
const POLL_MS      = parseInt(process.env.POLL_INTERVAL_MS || '300000');
const HOUR         = parseInt(process.env.DAILY_SUMMARY_HOUR || '21');

function enabled() {
  return ntfy.isConfigured() && !['off', 'false', '0'].includes(String(process.env.DAILY_SUMMARY).toLowerCase());
}

async function safeCall(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

// Each snapshot stands for one poll interval of draw, so kWh ≈ Σ kW × interval
function topCircuits(date, limit = 3) {
  const hours = POLL_MS / 3_600_000;
  return db.prepare(`
    SELECT name, ROUND(SUM(kw) * ?, 2) AS kwh
    FROM   circuit_snapshots
    WHERE  date(recorded_at) = ? AND channel_num NOT IN ('1,2,3', 'Balance')
    GROUP  BY channel_num
    ORDER  BY kwh DESC
    LIMIT  ?
  `).all(hours, date, limit);
}

async function buildSummary(date = localDate()) {
  const stored = db.prepare('SELECT * FROM daily_totals WHERE date = ?').get(date);
  const usedKwh  = await safeCall(() => emporia.getDailyKwh(), null) ?? stored?.emporia_kwh ?? null;
  const solarWh  = await safeCall(() => apsystems.fetchTodayWh(), null) || stored?.solar_wh || 0;
  const solarKwh = solarWh / 1000;

  const lines = [];
  if (usedKwh == null) {
    lines.push('No usage data recorded today.');
  } else {
    const netKwh = usedKwh - solarKwh;
    const cost   = Math.max(netKwh, 0) * RATE_PER_KWH;
    lines.push(`Used ${usedKwh.toFixed(1)} kWh`);
    if (apsystems.isConfigured()) lines.push(`Solar ${solarKwh.toFixed(1)} kWh`);
    lines.push(netKwh >= 0
      ? `Net from grid ${netKwh.toFixed(1)} kWh ($${cost.toFixed(2)} at $${RATE_PER_KWH}/kWh)`
      : `Net to grid ${(-netKwh).toFixed(1)} kWh`);
  }

  const top = topCircuits(date);
  if (top.length) {
    lines.push('', 'Top circuits:');
    for (const c of top) lines.push(`• ${c.name}: ${c.kwh} kWh`);
  }

  return { title: `Energy for ${date}`, body: lines.join('\n') };
}

async function sendSummary({ dryRun = false } = {}) {
  const { title, body } = await buildSummary();
  if (dryRun) {
    console.log(`${title}\n${body}`);
    return true;
  }
  const ok = await ntfy.sendAlert(title, body, { priority: 'low', tags: 'bar_chart' });
  console.log(`[summary] ${ok ? 'sent' : 'failed to send'} ${title}`);
  return ok;
}

// ms until the next HOUR:00 local time (setHours follows TZ, including DST)
function msUntilNext(hour, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function startDailySummary() {
  if (!enabled()) {
    console.log('[summary] NTFY_TOPIC not set or DAILY_SUMMARY=off — daily summary disabled');
    return;
  }
  const schedule = () => setTimeout(async () => {
    await sendSummary();
    schedule();
  }, msUntilNext(HOUR));
  schedule();
  console.log(`[summary] daily summary at ${String(HOUR).padStart(2, '0')}:00`);
}

module.exports = { startDailySummary, sendSummary, buildSummary, msUntilNext, topCircuits };
