// ntfy.sh push notifications. Leave NTFY_TOPIC blank to disable.

const NTFY_TOPIC  = process.env.NTFY_TOPIC;
const NTFY_SERVER = process.env.NTFY_SERVER || 'https://ntfy.sh';

function isConfigured() {
  return !!NTFY_TOPIC;
}

async function sendAlert(title, body, { priority = 'high', tags = 'warning,electric_plug' } = {}) {
  if (!NTFY_TOPIC) return false;
  try {
    const res = await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
      method:  'POST',
      headers: { Title: title, Priority: priority, Tags: tags },
      body,
    });
    return res.ok;
  } catch (err) {
    console.warn('[ntfy] send failed:', err.message);
    return false;
  }
}

module.exports = { isConfigured, sendAlert };
