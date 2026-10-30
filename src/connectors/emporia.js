// Emporia Vue Gen 2 — unofficial API via AWS Cognito auth
// Refs: https://github.com/magico13/PyEmVue (protocol reference)

const COGNITO_URL    = 'https://cognito-idp.us-east-2.amazonaws.com/';
const COGNITO_CLIENT = '4qte47jbstod8apnfic0bunmrq';
const EMPORIA_API    = 'https://api.emporiaenergy.com';

const EMAIL    = process.env.EMPORIA_EMAIL;
const PASSWORD = process.env.EMPORIA_PASSWORD;

let idToken    = null;
let tokenExpiry = 0;
let deviceGid  = null;

function isConfigured() {
  return !!(EMAIL && PASSWORD);
}

async function authenticate() {
  const res = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-amz-json-1.1',
      'X-Amz-Target':  'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow:        'USER_PASSWORD_AUTH',
      ClientId:        COGNITO_CLIENT,
      AuthParameters:  { USERNAME: EMAIL, PASSWORD },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Emporia auth failed: ${data.message || res.status}`);
  idToken     = data.AuthenticationResult.IdToken;
  tokenExpiry = Date.now() + (data.AuthenticationResult.ExpiresIn - 60) * 1000;
}

async function getToken() {
  if (!idToken || Date.now() >= tokenExpiry) await authenticate();
  return idToken;
}

async function getDeviceGid() {
  if (deviceGid) return deviceGid;
  const tok = await getToken();
  const res = await fetch(`${EMPORIA_API}/customers?email=${encodeURIComponent(EMAIL)}`, {
    headers: { authtoken: tok },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Emporia customers failed: ${res.status}`);
  deviceGid = data.devices?.[0]?.deviceGid;
  if (!deviceGid) throw new Error('No Emporia devices found for account');
  return deviceGid;
}

// 10-second cache — stats and circuits routes both call this on the same request cycle
let usageCache    = null;
let usageCacheAt  = 0;

async function getInstantUsage() {
  if (usageCache && Date.now() - usageCacheAt < 10_000) return usageCache;

  const [tok, gid] = await Promise.all([getToken(), getDeviceGid()]);
  const instant    = new Date().toISOString();
  const url        = `${EMPORIA_API}/AppAPI?apiMethod=getDeviceListUsages` +
                     `&deviceGids=${gid}&instant=${encodeURIComponent(instant)}` +
                     `&scale=1S&energyUnit=KilowattHours`;

  const res  = await fetch(url, { headers: { authtoken: tok } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Emporia usage failed: ${res.status}`);

  const channels = data.deviceListUsages?.devices?.[0]?.channelUsages ?? [];

  const circuits = channels.map(ch => ({
    channelNum: ch.channelNum,
    name:       ch.name,
    // usage is kWh for a 1-second window; *3600 converts to kW
    kw:         parseFloat(((ch.usage ?? 0) * 3600).toFixed(3)),
    isMain:     ch.channelNum === '1,2,3',
  }));

  const main    = circuits.find(c => c.isMain);
  const subs    = circuits.filter(c => !c.isMain);
  const subSum  = subs.reduce((s, c) => s + c.kw, 0);
  const balance = parseFloat(((main?.kw ?? 0) - subSum).toFixed(3));

  const live = [
    ...(main ? [main] : []),
    ...subs.sort((a, b) => b.kw - a.kw),
    ...(main ? [{ channelNum: 'Balance', name: 'Unmonitored', kw: balance, isBalance: true }] : []),
  ];

  usageCache = {
    totalKw:  main?.kw ?? 0,
    circuits: live,
    summary:  {
      total_kw:      main?.kw ?? 0,
      monitored_pct: main?.kw
        ? parseFloat(((subSum / main.kw) * 100).toFixed(1))
        : 0,
    },
  };
  usageCacheAt = Date.now();
  return usageCache;
}

// Returns today's total kWh from the Main (1,2,3) channel
async function getDailyKwh() {
  const [tok, gid] = await Promise.all([getToken(), getDeviceGid()]);
  const now        = new Date();
  // Use end-of-day instant so the 1D bucket covers the full day so far
  const instant    = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59
  ).toISOString();
  const url = `${EMPORIA_API}/AppAPI?apiMethod=getDeviceListUsages` +
              `&deviceGids=${gid}&instant=${encodeURIComponent(instant)}` +
              `&scale=1D&energyUnit=KilowattHours`;

  const res  = await fetch(url, { headers: { authtoken: tok } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Emporia daily failed: ${res.status}`);

  const channels = data.deviceListUsages?.devices?.[0]?.channelUsages ?? [];
  const main     = channels.find(ch => ch.channelNum === '1,2,3');
  return main?.usage ?? null;
}

module.exports = { isConfigured, getInstantUsage, getDailyKwh };
