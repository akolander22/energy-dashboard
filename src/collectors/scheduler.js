/**
 * SCHEDULER
 * Kicks off data collection jobs on configured intervals.
 * Runs inside the same Node process as the Express server.
 */

const { collectDailyTotals }    = require('./dailyTotals');
const { collectCircuitSnapshot } = require('./circuitSnapshot');

const CIRCUIT_INTERVAL_MS  = parseInt(process.env.CIRCUIT_INTERVAL_MS  || 5 * 60 * 1000);  // 5 min
const DAILY_INTERVAL_MS    = parseInt(process.env.DAILY_INTERVAL_MS    || 12 * 60 * 60 * 1000); // 12 hrs

function start() {
  console.log(`[Scheduler] Circuit snapshots every ${CIRCUIT_INTERVAL_MS / 1000}s`);
  console.log(`[Scheduler] Daily totals every ${DAILY_INTERVAL_MS / 1000 / 3600}h`);

  // Run immediately on startup, then on interval
  runSafe('circuits', collectCircuitSnapshot);
  runSafe('daily',    collectDailyTotals);

  setInterval(() => runSafe('circuits', collectCircuitSnapshot), CIRCUIT_INTERVAL_MS);
  setInterval(() => runSafe('daily',    collectDailyTotals),    DAILY_INTERVAL_MS);
}

async function runSafe(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[Scheduler:${label}] Uncaught error:`, err.message);
  }
}

module.exports = { start };
