/**
 * CIRCUIT SNAPSHOT COLLECTOR
 * Fetches current draw for all 20 Emporia circuits and stores
 * a time-series snapshot to MongoDB.
 *
 * Also maintains the Circuit registry — upserts circuit metadata
 * and recomputes rolling averages after each snapshot.
 */

const emporia        = require('../connectors/emporia');
const Circuit        = require('../db/models/Circuit');
const CircuitReading = require('../db/models/CircuitReading');

async function collectCircuitSnapshot() {
  if (!emporia.isConfigured()) {
    // Still store placeholder data so the UI has something to show
    await storePlaceholderSnapshot();
    return;
  }

  let circuitData;
  try {
    circuitData = await emporia.fetchCircuitUsage();
  } catch (err) {
    console.warn('[Collector:circuits] Emporia fetch failed:', err.message);
    return;
  }

  const timestamp = new Date();
  const { circuits } = circuitData;

  // Bulk write all readings
  const readings = circuits.map(c => ({
    timestamp,
    channel_num: c.channelNum,
    name:        c.name,
    kw:          c.kw,
    is_main:     c.isMain,
  }));

  await CircuitReading.insertMany(readings);

  // Upsert circuit registry + recompute averages
  for (const c of circuits) {
    const stats = await CircuitReading.aggregate([
      { $match: { channel_num: c.channelNum } },
      { $group: {
        _id: '$channel_num',
        avg_kw:        { $avg: '$kw' },
        max_kw:        { $max: '$kw' },
        reading_count: { $sum: 1 },
        first_seen:    { $min: '$timestamp' },
      }},
    ]);

    const s = stats[0] || {};

    await Circuit.findOneAndUpdate(
      { channel_num: c.channelNum },
      {
        $set: {
          name:          c.name,
          is_active:     true,
          avg_kw:        s.avg_kw    != null ? parseFloat(s.avg_kw.toFixed(3))    : null,
          max_kw:        s.max_kw    != null ? parseFloat(s.max_kw.toFixed(3))    : null,
          reading_count: s.reading_count ?? 0,
          monitored_from: s.first_seen ?? timestamp,
          monitored_until: null, // null = currently active
        },
      },
      { upsert: true, new: true }
    );
  }

  // Mark circuits NOT in this snapshot as inactive
  const activeChannels = circuits.map(c => c.channelNum);
  await Circuit.updateMany(
    { channel_num: { $nin: activeChannels }, is_active: true },
    { $set: { is_active: false, monitored_until: timestamp } }
  );

  // Compute unknown draw
  const main = circuits.find(c => c.isMain);
  const monitored = circuits.filter(c => !c.isMain).reduce((s, c) => s + c.kw, 0);
  const unknown = main ? parseFloat((main.kw - monitored).toFixed(3)) : null;

  console.log(`[Collector:circuits] ${circuits.length} circuits | Total: ${main?.kw ?? '?'} kW | Monitored: ${monitored.toFixed(2)} kW | Unknown: ${unknown ?? '?'} kW`);
}

async function storePlaceholderSnapshot() {
  const timestamp = new Date();
  const placeholders = [
    { channel_num: '1,2,3', name: 'Main',     kw: 2.4,  is_main: true  },
    { channel_num: '1',     name: 'HVAC',     kw: 0.9,  is_main: false },
    { channel_num: '2',     name: 'Kitchen',  kw: 0.4,  is_main: false },
    { channel_num: '3',     name: 'Office',   kw: 0.3,  is_main: false },
    { channel_num: '4',     name: 'Garage',   kw: 0.2,  is_main: false },
    { channel_num: '5',     name: 'Basement', kw: 0.15, is_main: false },
  ];
  await CircuitReading.insertMany(placeholders.map(c => ({ ...c, timestamp })));
}

module.exports = { collectCircuitSnapshot };
