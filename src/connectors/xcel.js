/**
 * XCEL ITRON CONNECTOR
 * Reads real-time power data from your Xcel Itron Gen 5 Riva smart meter
 * over your local network using the Launchpad program.
 *
 * SETUP REQUIRED (one-time):
 *  1. Log into xcelenergy.com → Meters & Devices → Enroll in Launchpad
 *     (takes a few days for Xcel to approve)
 *  2. Run: bash scripts/generate_xcel_certs.sh
 *     This creates certs/xcel.key and certs/xcel.crt
 *  3. Copy the LFDI printed by the script
 *  4. On xcelenergy.com → Meters & Devices → Add Device → paste LFDI
 *  5. Set XCEL_METER_IP in your .env to the meter's local IP
 *     (find it in your router's DHCP table — look for hostname "xcel-meter"
 *      or a MAC address starting with B4:23:30)
 *  6. Set XCEL_CERT_PATH and XCEL_KEY_PATH in .env (default: ./certs/)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const METER_IP   = process.env.XCEL_METER_IP   || null;
const METER_PORT = process.env.XCEL_METER_PORT  || 8081;
const CERT_PATH  = process.env.XCEL_CERT_PATH   || path.join(__dirname, '../../certs/xcel.crt');
const KEY_PATH   = process.env.XCEL_KEY_PATH    || path.join(__dirname, '../../certs/xcel.key');

// Cache so we're not hammering the meter on every dashboard request
let _cache = { currentKw: null, totalKwh: null, deliveredKwh: null, receivedKwh: null, ts: 0 };
const CACHE_TTL_MS = 10_000; // refresh at most every 10s

function certsAvailable() {
  return fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);
}

/**
 * Fetch instantaneous demand (kW) and cumulative energy (kWh) from the meter.
 * The meter exposes a local HTTPS endpoint on port 8081 using the IEEE 2030.5 protocol.
 *
 * Two endpoints we care about:
 *   /upt/1/mr/3/r  → cumulative delivered + received kWh readings
 *   /upt/1/mr/1/r  → instantaneous demand (kW)
 */
async function fetchMeterReading() {
  if (!METER_IP) throw new Error('XCEL_METER_IP not set');
  if (!certsAvailable()) throw new Error('Xcel TLS certs not found — run scripts/generate_xcel_certs.sh');

  const now = Date.now();
  if (_cache.currentKw !== null && now - _cache.ts < CACHE_TTL_MS) return _cache;

  const [demand, energy] = await Promise.all([
    xcelGet('/upt/1/mr/1/r'),
    xcelGet('/upt/1/mr/3/r'),
  ]);

  // IEEE 2030.5 XML parsing — extract the numeric values we need
  const currentKw       = extractValue(demand,  'InstantaneousDemand') / 1000;
  const deliveredKwh    = extractValue(energy,  'CurrentSummationDelivered') / 1000;
  const receivedKwh     = extractValue(energy,  'CurrentSummationReceived') / 1000;

  _cache = { currentKw, deliveredKwh, receivedKwh, totalKwh: deliveredKwh, ts: now };
  return _cache;
}

function xcelGet(urlPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: METER_IP,
      port: METER_PORT,
      path: urlPath,
      method: 'GET',
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
      rejectUnauthorized: false, // meter uses self-signed cert
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Meter request timed out')); });
    req.end();
  });
}

// Naive XML value extractor — avoids pulling in a full XML parser dependency
function extractValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return match ? parseFloat(match[1]) : 0;
}

module.exports = { fetchMeterReading, isConfigured: () => !!METER_IP && certsAvailable() };
