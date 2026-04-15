/**
 * EMPORIA VUE CONNECTOR
 * Pulls circuit-level energy data from your Emporia Vue monitor
 * via the unofficial cloud API (emporia-vue-lib).
 *
 * SETUP:
 *   EMPORIA_EMAIL=your@email.com
 *   EMPORIA_PASSWORD=yourpassword
 */

let EmporiaVue, Scale, Unit;
try {
  ({ EmporiaVue, Scale, Unit } = require('emporia-vue-lib'));
} catch {
  // Library not installed
}

const EMAIL      = process.env.EMPORIA_EMAIL    || null;
const PASSWORD   = process.env.EMPORIA_PASSWORD || null;
const TOKEN_FILE = process.env.EMPORIA_TOKEN_FILE || './emporia_tokens.json';

let _client      = null;
let _loginPromise = null; // singleton — prevents concurrent login races
let _devices     = null;

let _cache = { circuits: [], totalKw: null, ts: 0 };
const CACHE_TTL_MS = 60_000;

async function getClient() {
  if (_client) return _client;

  // If login is already in progress, wait for that same promise
  if (_loginPromise) return _loginPromise;

  if (!EmporiaVue) throw new Error('emporia-vue-lib not installed');
  if (!EMAIL || !PASSWORD) throw new Error('EMPORIA_EMAIL / EMPORIA_PASSWORD not set in .env');

  _loginPromise = (async () => {
    console.log('[Emporia] Logging in...');
    const vue = new EmporiaVue();
    await vue.login({ username: EMAIL, password: PASSWORD, tokenStorageFile: TOKEN_FILE });
    _client = vue;
    return _client;
  })();

  try {
    return await _loginPromise;
  } catch (err) {
    _loginPromise = null; // reset so next call retries
    throw err;
  }
}

async function getDevices() {
  if (_devices) return _devices;
  const client = await getClient();
  _devices = await client.getDevices();
  return _devices;
}

async function fetchCircuitUsage() {
  const now = Date.now();
  if (_cache.totalKw !== null && now - _cache.ts < CACHE_TTL_MS) return _cache;

  const client  = await getClient();
  const devices = await getDevices();
  const deviceGids = devices.map(d => d.deviceGid.toString());

  const usageData = await client.getDeviceListUsage(
    deviceGids,
    undefined,
    Scale.MINUTE,
    Unit.KWH
  );

  for (const [deviceGid, device] of Object.entries(usageData)) {
    console.log(`Device ${deviceGid} (${device.name}):`);
    for (const [channelNum, channel] of Object.entries(device.deviceUsages)) {
      console.log(`Device ${deviceGid}, Channel ${channelNum}: ${channel.usage} kWh`);
    }
  }

  console.log('[Emporia] Raw usage data:', usageData[channelUsages]);

  const circuits = [];
  let totalKw = 0;

  for (const [, device] of Object.entries(usageData)) {
    for (const [channelNum, channel] of Object.entries(device.channels)) {
      const kw = parseFloat(((channel.usage || 0) * 60).toFixed(3));
      console.log(`Device ${device.deviceGid} Channel ${channelNum} (${channel.name}): ${kw} kW`);
      if (channelNum === '1,2,3') {
        totalKw = kw;
        circuits.unshift({ name: channel.name || 'Main', kw, channelNum, isMain: true });
      } else if (channel.usage > 0) {
        circuits.push({ name: channel.name || `Circuit ${channelNum}`, kw, channelNum, isMain: false });
      }
    }
  }

  console.log('[Emporia] Fetched circuit usage:', circuits, 'Total kW:', totalKw);

  const [main, ...rest] = circuits;
  const sorted = [main, ...rest.sort((a, b) => b.kw - a.kw)].filter(Boolean);

  _cache = { circuits: sorted, totalKw, ts: now };
  return _cache;
}

async function fetchHourlyToday() {
  const client  = await getClient();
  const devices = await getDevices();

  if (!devices.length) return [];

  const mainChannel = devices[0].channels?.find(c => c.channelNum === '1,2,3') || devices[0].channels?.[0];
  if (!mainChannel) return [];

  const now   = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  // const usageOverTime = await client.getUsageOverTime(mainChannel, start, now, Scale.HOUR, Unit.KWH);

  // return (usageOverTime || []).map((kwh, i) => ({
  //   hour: i,
  //   label: `${String(i).padStart(2, '0')}:00`,
  //   kwh: parseFloat((kwh || 0).toFixed(2)),
  // }));
    const deviceGids = devices.map(d => d.deviceGid.toString());
  const usageData = await client.getDeviceListUsage(
    deviceGids,
    undefined, // current time
    Scale.MINUTE,
    Unit.KWH
  );
  return (usageData || []).map((kwh, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    kwh: parseFloat((kwh || 0).toFixed(2)),
  }));
}

async function fetchDailyHistory(days = 30) {
  const client  = await getClient();
  const devices = await getDevices();
  if (!devices.length) return [];

  const mainChannel = devices[0].channels?.find(c => c.channelNum === '1,2,3') || devices[0].channels?.[0];
  if (!mainChannel) return [];

  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  // const usageOverTime = await client.getUsageOverTime(mainChannel, start, now, Scale.DAY, Unit.KWH);

  // return (usageOverTime || []).map((kwh, i) => {
  //   const d = new Date(start);
  //   d.setDate(d.getDate() + i);
  //   return {
  //     date: d.toISOString().split('T')[0],
  //     kwh: parseFloat((kwh || 0).toFixed(1)),
  //   };
  // });
      const deviceGids = devices.map(d => d.deviceGid.toString());
  const usageData = await client.getDeviceListUsage(
    deviceGids,
    undefined, // current time
    Scale.MINUTE,
    Unit.KWH
  );
  //console.log(usageData);

    for (const [gid, device] of Object.entries(usageData)) {
      for (const [channelNum, channel] of Object.entries(device.channels)) {
        console.log(`${gid} ${channelNum} ${channel.name} ${channel.usage} kwh`);
      }
    }
  // return(usageData || []).map((kwh, i) => {
  //   const d = new Date(start);
  //   d.setDate(d.getDate() + i);
  //   return {
  //     date: d.toISOString().split('T')[0],
  //     kwh: parseFloat((kwh || 0).toFixed(1)),
  //   };
  // });
}

function isConfigured() {
  return !!EmporiaVue && !!EMAIL && !!PASSWORD;
}

module.exports = { fetchCircuitUsage, fetchHourlyToday, fetchDailyHistory, isConfigured };
