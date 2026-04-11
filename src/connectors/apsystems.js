/**
 * APSYSTEMS EMA CONNECTOR (Everlight Solar)
 * Fetches solar production data from APsystems EMA cloud API.
 * Everlight installs APsystems microinverters and uses EMA for monitoring.
 *
 * SETUP REQUIRED:
 *  1. Open the APsystems EMA app (or apsystemsema.com)
 *  2. Find your ECU ID:
 *       App → select your system → top of screen shows "ECU ID: XXXXXXXXXX"
 *       OR: Settings → ECU Information
 *  3. Add to .env:
 *       APSYSTEMS_ECU_ID=your_ecu_id_here
 *       APSYSTEMS_SYSTEM_ID=your_system_id   (optional — for account-level data)
 *
 * NOTE: APsystems does not publish an official API. This uses the same endpoint
 * their mobile app hits. It has been stable for years but is not guaranteed.
 * No authentication is required for the ECU power endpoint (only ECU ID needed).
 */

const http = require('http');

const ECU_ID    = process.env.APSYSTEMS_ECU_ID    || null;
const API_HOST  = 'api.apsystemsema.com';
const API_PORT  = 8073;
const BASE_PATH = '/apsema/v1/ecu';

// Cache — EMA updates every ~5 minutes, so no need to hammer it
let _todayCache  = { data: null, date: null };
let _powerCache  = { watts: null, ts: 0 };
const POWER_CACHE_TTL_MS = 300_000; // 5 minutes

/**
 * Fetch today's solar production as a time-series array.
 * Returns: { times: ['HH:MM', ...], power: [watts, ...], totalWh: number }
 */
async function fetchTodayProduction() {
  if (!ECU_ID) throw new Error('APSYSTEMS_ECU_ID not set in .env');

  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const cacheDate = _todayCache.date;

  // Return cache if it's still today's data and we fetched recently
  if (cacheDate === today && _todayCache.data) return _todayCache.data;

  const raw = await emaPost(`${BASE_PATH}/getPowerInfo`, {
    ecuId: ECU_ID,
    filter: 'power',
    date: today,
  });

  const parsed = JSON.parse(raw);
  const dataBlock = parsed?.data || {};

  const times = dataBlock.time  || [];
  const power = (dataBlock.power || []).map(w => parseFloat(w) || 0);

  // Approximate total Wh: sum of (watts × interval in hours)
  // EMA typically returns data in 5-minute intervals
  const intervalHours = times.length > 1 ? 5 / 60 : 1;
  const totalWh = power.reduce((s, w) => s + w * intervalHours, 0);

  const result = { times, power, totalWh: parseFloat(totalWh.toFixed(0)) };
  _todayCache = { data: result, date: today };
  return result;
}

/**
 * Returns the most recent solar power output in watts.
 */
async function fetchCurrentWatts() {
  const now = Date.now();
  if (_powerCache.watts !== null && now - _powerCache.ts < POWER_CACHE_TTL_MS) {
    return _powerCache.watts;
  }

  const { power } = await fetchTodayProduction();
  const latest = power.length ? power[power.length - 1] : 0;
  _powerCache = { watts: latest, ts: now };
  return latest;
}

/**
 * Monthly production summary (kWh per day for the past N months).
 * Uses the getMonthlyEnergy endpoint.
 */
async function fetchMonthlyHistory(months = 3) {
  if (!ECU_ID) throw new Error('APSYSTEMS_ECU_ID not set in .env');

  const results = [];
  const now = new Date();

  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;

    try {
      const raw = await emaPost(`${BASE_PATH}/getMonthlyEnergy`, {
        ecuId: ECU_ID,
        date: ym,
      });
      const parsed = JSON.parse(raw);
      const days   = parsed?.data?.day   || [];
      const energy = parsed?.data?.energy || [];

      days.forEach((day, i) => {
        results.push({
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          kwh: parseFloat(((energy[i] || 0) / 1000).toFixed(2)), // Wh → kWh
        });
      });
    } catch (err) {
      console.warn(`[APSystems] Could not fetch month ${ym}:`, err.message);
    }
  }

  return results;
}

function emaPost(path, params) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const opts = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`APSystems API returned ${res.statusCode}: ${data}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('APSystems request timed out')); });
    req.write(body);
    req.end();
  });
}

function isConfigured() {
  return !!ECU_ID;
}

module.exports = { fetchTodayProduction, fetchCurrentWatts, fetchMonthlyHistory, isConfigured };
