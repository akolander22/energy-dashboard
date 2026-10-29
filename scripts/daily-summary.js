// Build today's summary now. --dry-run prints it instead of sending to ntfy.
//   node --env-file=.env scripts/daily-summary.js --dry-run
const { sendSummary } = require('../src/jobs/dailySummary');

sendSummary({ dryRun: process.argv.includes('--dry-run') })
  .then(ok => process.exit(ok ? 0 : 1));
