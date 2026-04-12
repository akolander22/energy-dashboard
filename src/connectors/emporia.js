/**
 * EMPORIA VUE CONNECTOR
 * Pulls circuit-level energy data from your Emporia Vue monitor
 * via the unofficial cloud API (emporia-vue-lib).
 *
 * SETUP REQUIRED:
 *  1. npm install emporia-vue-lib  (already in package.json if you used the updated one)
 *  2. Add to .env:
 *       EMPORIA_EMAIL=your@email.com
 *       EMPORIA_PASSWORD=yourpassword
 *       EMPORIA_TOKEN_FILE=./emporia_tokens.json   (optional — tokens cached here)
 *
 * DATA AVAILABLE:
 *  - Total house consumption (kW, kWh)
 *  - Per-circuit breakdown if you have the 8/16-circuit Vue 2
 *  - Historical usage at minute, hour, day granularity
 *
 * NOTE: This uses the unofficial Emporia API. It authenticates with AWS Cognito
 * under the hood (same as the mobile app). Emporia has acknowledged this exists
 * but doesn't officially support it. Tokens are refreshed automatically.
 */

let EmporiaVue, Scale, Unit;
try {
  ({ EmporiaVue, Scale, Unit } = require('emporia-vue-lib'));
} catch {
  // Library not installed yet — connector will report unconfigured
}

const EMAIL    = process.env.EMPORIA_EMAIL    || null;
const PASSWORD = process.env.EMPORIA_PASSWORD || null;
const TOKEN_FILE = process.env.EMPORIA_TOKEN_FILE || './emporia_tokens.json';

let _client = null;
let _devices = null;

// Cache — Emporia API is cloud-based so we poll conservatively
let _cache = { circuits: [], totalKw: null, ts: 0 };
const CACHE_TTL_MS = 60_000; // refresh every 60s max

async function getClient() {
  if (_client) return _client;
  if (!EmporiaVue) throw new Error('emporia-vue-lib not installed — run: npm install emporia-vue-lib');
  if (!EMAIL || !PASSWORD) throw new Error('EMPORIA_EMAIL / EMPORIA_PASSWORD not set in .env');

  _client = new EmporiaVue();
  await _client.login({ username: EMAIL, password: PASSWORD, tokenStorageFile: TOKEN_FILE });
  return _client;
}

async function getDevices() {
  if (_devices) return _devices;
  const client = await getClient();
  _devices = await client.getDevices();
  return _devices;
}

/**
 * Returns current power draw broken down by circuit.
 * Each entry: { name, kw, channelNum, deviceGid }
 */
async function fetchCircuitUsage() {
  const now = Date.now();
  if (_cache.totalKw !== null && now - _cache.ts < CACHE_TTL_MS) return _cache;

  const client = await getClient();
  const devices = await getDevices();
  const deviceGids = devices.map(d => d.deviceGid.toString());

  // Scale.MINUTE gives us kWh over the last minute → multiply by 60 to get kW
  const usageData = await client.getDeviceListUsage(
    deviceGids,
    undefined,       // current time
    Scale.MINUTE,
    Unit.KWH
  );

  const circuits = [];
  let totalKw = 0;

  for (const [, device] of Object.entries(usageData)) {
    for (const [channelNum, channel] of Object.entries(device.channels)) {
      if (channelNum === '1,2,3') {
        // This is the "Main" / whole-home channel — use as total
        const kw = parseFloat(((channel.usage || 0) * 60).toFixed(3));
        totalKw = kw;
        circuits.unshift({ name: channel.name || 'Main', kw, channelNum, isMain: true });
      } else if (channel.usage > 0) {
        const kw = parseFloat(((channel.usage || 0) * 60).toFixed(3));
        circuits.push({ name: channel.name || `Circuit ${channelNum}`, kw, channelNum, isMain: false });
      }
    }
  }

  // Sort non-main circuits by draw descending
  const [main, ...rest] = circuits;
  const sorted = [main, ...rest.sort((a, b) => b.kw - a.kw)].filter(Boolean);

  _cache = { circuits: sorted, totalKw, ts: now };
  return _cache;
}

/**
 * Hourly usage for today, in kWh per hour.
 * Returns array of { hour, label, kwh }
 */
async function fetchHourlyToday() {
  const client = await getClient();
  const devices = await getDevices();
  if (!devices.length) return [];

  const mainDevice = devices[0];
  const mainChannel = mainDevice.channels?.find(c => c.channelNum === '1,2,3') || mainDevice.channels?.[0];
  if (!mainChannel) return [];

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const usageOverTime = await client.getUsageOverTime(
    mainChannel,
    start,
    now,
    Scale.HOUR,
    Unit.KWH
  );

  return (usageOverTime || []).map((kwh, i) => ({
    hour: i,
    label: `${i.toString().padStart(2, '0')}:00`,
    kwh: parseFloat((kwh || 0).toFixed(2)),
  }));
}

/**
 * Daily totals for the past N days, in kWh.
 * Returns array of { date, kwh }
 */
async function fetchDailyHistory(days = 30) {
  const client = await getClient();
  const devices = await getDevices();
  if (!devices.length) return [];

  const mainDevice = devices[0];
  const mainChannel = mainDevice.channels?.find(c => c.channelNum === '1,2,3') || mainDevice.channels?.[0];
  if (!mainChannel) return [];

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  const usageOverTime = await client.getUsageOverTime(
    mainChannel,
    start,
    now,
    Scale.DAY,
    Unit.KWH
  );

  return (usageOverTime || []).map((kwh, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split('T')[0],
      kwh: parseFloat((kwh || 0).toFixed(1)),
    };
  });
}

function isConfigured() {
  return !!EmporiaVue && !!EMAIL && !!PASSWORD;
}

module.exports = { fetchCircuitUsage, fetchHourlyToday, fetchDailyHistory, isConfigured };
