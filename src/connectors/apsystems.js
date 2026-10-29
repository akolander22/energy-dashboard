// APSystems solar inverter — supports local ECU LAN API or cloud EMA API
// Local ECU: set APSYSTEMS_ECU_IP (faster, no auth needed)
// Cloud EMA: set APSYSTEMS_ECU_ID + APSYSTEMS_API_KEY

const ECU_IP   = process.env.APSYSTEMS_ECU_IP;
const ECU_ID   = process.env.APSYSTEMS_ECU_ID;
const API_KEY  = process.env.APSYSTEMS_API_KEY;
const CLOUD    = 'https://api.apsystemsema.com:8073/apsema/v1/ecu/getPowerInfo';

function isConfigured() {
  return !!(ECU_IP || (ECU_ID && API_KEY));
}

// 30-second cache — current watts and today's Wh are fetched together
let apCache   = null;
let apCacheAt = 0;

async function fetchData() {
  if (apCache && Date.now() - apCacheAt < 30_000) return apCache;

  let raw;
  if (ECU_IP) {
    const res = await fetch(`http://${ECU_IP}/index.php/realtimedata`, {
      signal: AbortSignal.timeout(5000),
    });
    raw = await res.json();
    const d = raw.data ?? raw;
    apCache = {
      currentWatts: parseFloat(d.current_power ?? 0),
      // Local ECU returns today_energy in kWh; convert to Wh for consistency
      todayWh: parseFloat(d.today_energy ?? 0) * 1000,
    };
  } else if (ECU_ID && API_KEY) {
    const res = await fetch(`${CLOUD}?ecuId=${ECU_ID}`, {
      headers: { Authorization: API_KEY },
      signal:  AbortSignal.timeout(8000),
    });
    raw = await res.json();
    const d = raw.data ?? {};
    apCache = {
      currentWatts: parseFloat(d.current_power ?? 0),
      todayWh:      parseFloat(d.today_energy  ?? 0),
    };
  } else {
    return { currentWatts: 0, todayWh: 0 };
  }

  apCacheAt = Date.now();
  return apCache;
}

async function fetchCurrentWatts() {
  return (await fetchData()).currentWatts;
}

async function fetchTodayWh() {
  return (await fetchData()).todayWh;
}

module.exports = { isConfigured, fetchCurrentWatts, fetchTodayWh };
