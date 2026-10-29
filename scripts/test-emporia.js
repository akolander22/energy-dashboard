// Quick Emporia check — logs in and prints the current draw per circuit.
// Reads credentials from .env; never hard-code them.
//   node --env-file=.env scripts/test-emporia.js
const emporia = require('../src/connectors/emporia');

if (!emporia.isConfigured()) {
  console.error('Set EMPORIA_EMAIL and EMPORIA_PASSWORD in .env first');
  process.exit(1);
}

emporia.getInstantUsage()
  .then(usage => {
    console.log(`SUCCESS — total ${usage.totalKw} kW`);
    for (const c of usage.circuits) console.log(`  ${c.name.padEnd(24)} ${c.kw} kW`);
  })
  .catch(err => {
    console.log('FAIL:', err.message);
    process.exit(1);
  });
