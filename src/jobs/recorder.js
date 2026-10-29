// Background poller — runs every POLL_INTERVAL_MS (default 5 min)
// Stores circuit snapshots for averages and upserts daily totals.
// Optional ntfy.sh alert when draw exceeds ALERT_KW_THRESHOLD.

const db        = require('../db');
const { localDate } = require('../lib/time');
const emporia   = require('../connectors/emporia');
const apsystems = require('../connectors/apsystems');
const { sendAlert } = require('../lib/ntfy');

const POLL_MS        = parseInt(process.env.POLL_INTERVAL_MS   || '300000');  // 5 min
const ALERT_KW       = parseFloat(process.env.ALERT_KW_THRESHOLD || '0');    // 0 = off
const ALERT_COOLDOWN = 30 * 60 * 1000; // don't re-alert within 30 min

const stmtUpsert = db.prepare(`
  INSERT INTO daily_totals (date, emporia_kwh, solar_wh, updated_at)
  VALUES (?, ?, ?, datetime('now', 'localtime'))
  ON CONFLICT(date) DO UPDATE SET
    emporia_kwh = excluded.emporia_kwh,
    solar_wh    = excluded.solar_wh,
    updated_at  = datetime('now', 'localtime')
`);

const stmtInsertSnap = db.prepare(
  "INSERT INTO circuit_snapshots (channel_num, name, kw, recorded_at) VALUES (?, ?, ?, datetime('now', 'localtime'))"
);

const stmtPrune = db.prepare(
  "DELETE FROM circuit_snapshots WHERE recorded_at < datetime('now', 'localtime', '-30 days')"
);

const insertSnapshots = db.transaction((circuits) => {
  for (const c of circuits) stmtInsertSnap.run(c.channelNum, c.name, c.kw);
});

let lastAlertAt = 0;

async function poll() {
  const today = localDate();

  // --- Circuit snapshot + alert check ---
  try {
    const usage = await emporia.getInstantUsage();

    // Store all non-balance circuits for averages
    insertSnapshots(usage.circuits.filter(c => !c.isBalance));

    if (ALERT_KW > 0 && usage.totalKw >= ALERT_KW) {
      const now = Date.now();
      if (now - lastAlertAt > ALERT_COOLDOWN) {
        lastAlertAt = now;
        await sendAlert(
          'High Energy Usage',
          `Current draw: ${usage.totalKw.toFixed(2)} kW (threshold: ${ALERT_KW} kW)`
        );
      }
    }
  } catch (err) {
    console.warn('[recorder] circuit poll failed:', err.message);
  }

  // --- Daily totals ---
  try {
    const [emporiaKwh, solarWh] = await Promise.all([
      emporia.getDailyKwh(),
      apsystems.fetchTodayWh(),
    ]);
    if (emporiaKwh != null || solarWh) {
      stmtUpsert.run(today, emporiaKwh ?? null, solarWh || null);
    }
  } catch (err) {
    console.warn('[recorder] daily total update failed:', err.message);
  }

  // Prune old snapshots ~once per day (1% chance per poll at 5-min intervals ≈ every ~8h)
  if (Math.random() < 0.01) stmtPrune.run();
}

function startRecorder() {
  if (!emporia.isConfigured()) {
    console.log('[recorder] EMPORIA_EMAIL/PASSWORD not set — recorder disabled');
    return;
  }
  console.log(`[recorder] polling every ${POLL_MS / 1000}s`);
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { startRecorder };
