/**
 * DAILY TOTALS COLLECTOR
 * Fetches whole-home kWh from Xcel, Emporia, and APSystems
 * and upserts into the daily_totals collection.
 *
 * Runs twice daily (configurable). Uses upsert so re-running
 * the same day just updates the existing document.
 */

const xcel      = require('../connectors/xcel');
const emporia   = require('../connectors/emporia');
const apsystems = require('../connectors/apsystems');
const DailyTotal = require('../db/models/DailyTotal');

async function collectDailyTotals() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[Collector:daily] Running for ${today}`);

  const result = {
    date: today,
    sources: { xcel: 'placeholder', emporia: 'placeholder', apsystems: 'placeholder' },
  };

  // --- Xcel ---
  if (xcel.isConfigured()) {
    try {
      const reading = await xcel.fetchMeterReading();
      // Xcel meter gives cumulative kWh — we store the snapshot
      // For daily total, compare against yesterday's stored value
      const yesterday = await DailyTotal.findOne({
        date: getPreviousDate(today)
      });
      const prevKwh = yesterday?.xcel_kwh ?? null;
      result.xcel_kwh = reading.deliveredKwh;
      result.xcel_daily_kwh = prevKwh !== null
        ? parseFloat((reading.deliveredKwh - prevKwh).toFixed(2))
        : null;
      result.sources.xcel = 'live';
    } catch (err) {
      console.warn('[Collector:daily] Xcel error:', err.message);
      result.sources.xcel = 'error';
    }
  }

  // --- Emporia ---
  if (emporia.isConfigured()) {
    try {
      const history = await emporia.fetchDailyHistory(2); // today + yesterday
      const todayEntry = history.find(d => d.date === today);
      if (todayEntry) {
        result.emporia_kwh = todayEntry.kwh;
        result.sources.emporia = 'live';
      }
    } catch (err) {
      console.warn('[Collector:daily] Emporia error:', err.message);
      result.sources.emporia = 'error';
    }
  }

  // --- APSystems (Solar) ---
  if (apsystems.isConfigured()) {
    try {
      const { totalWh } = await apsystems.fetchTodayProduction();
      result.solar_kwh = parseFloat((totalWh / 1000).toFixed(2));
      result.sources.apsystems = 'live';
    } catch (err) {
      console.warn('[Collector:daily] APSystems error:', err.message);
      result.sources.apsystems = 'error';
    }
  }

  // --- Compute net grid draw ---
  const solar = result.solar_kwh ?? 0;
  if (result.xcel_daily_kwh != null) result.xcel_net    = parseFloat((result.xcel_daily_kwh - solar).toFixed(2));
  if (result.emporia_kwh    != null) result.emporia_net = parseFloat((result.emporia_kwh - solar).toFixed(2));
  // solar_net = solar app total usage - production (if solar app exposes total usage)
  // For now leave null — APSystems only reports production, not consumption

  result.collected_at = new Date();

  // Upsert — update today's doc if it exists, create if not
  await DailyTotal.findOneAndUpdate(
    { date: today },
    { $set: result },
    { upsert: true, new: true }
  );

  console.log(`[Collector:daily] Stored — Xcel: ${result.xcel_daily_kwh ?? 'n/a'} kWh | Emporia: ${result.emporia_kwh ?? 'n/a'} kWh | Solar: ${result.solar_kwh ?? 'n/a'} kWh`);
  return result;
}

function getPreviousDate(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

module.exports = { collectDailyTotals };
