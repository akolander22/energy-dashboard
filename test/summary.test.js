const test   = require('node:test');
const assert = require('node:assert');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

// Throwaway database; no Emporia/APSystems credentials, so stored values are used
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'energy-test-'));
process.env.DB_PATH = path.join(dir, 'energy.db');
process.env.RATE_PER_KWH = '0.15';
process.env.POLL_INTERVAL_MS = String(60 * 60 * 1000); // 1 snapshot = 1 hour
delete process.env.EMPORIA_EMAIL;

const db = require('../src/db');
const { buildSummary, msUntilNext } = require('../src/jobs/dailySummary');

test('summary uses stored totals and ranks circuits', async () => {
  db.prepare('INSERT INTO daily_totals (date, emporia_kwh, solar_wh) VALUES (?, ?, ?)')
    .run('2026-10-28', 30, 8000);
  const snap = db.prepare("INSERT INTO circuit_snapshots (channel_num, name, kw, recorded_at) VALUES (?, ?, ?, ?)");
  snap.run('1', 'Dryer', 3.0, '2026-10-28 18:00:00');
  snap.run('1', 'Dryer', 2.0, '2026-10-28 19:00:00');
  snap.run('2', 'Fridge', 0.2, '2026-10-28 18:00:00');
  snap.run('3', 'AC', 1.5, '2026-10-28 18:00:00');
  snap.run('4', 'Lights', 0.1, '2026-10-28 18:00:00');
  snap.run('1,2,3', 'Main', 9.9, '2026-10-28 18:00:00');
  snap.run('1', 'Dryer', 9.0, '2026-10-27 18:00:00'); // yesterday, ignored

  const { title, body } = await buildSummary('2026-10-28');
  assert.strictEqual(title, 'Energy for 2026-10-28');
  assert.match(body, /Used 30\.0 kWh/);
  assert.match(body, /Net from grid 22\.0 kWh \(\$3\.30 at \$0\.15\/kWh\)/);
  const top = body.split('Top circuits:\n')[1].split('\n');
  assert.deepStrictEqual(top, ['• Dryer: 5 kWh', '• AC: 1.5 kWh', '• Fridge: 0.2 kWh']);
});

test('summary with no data says so', async () => {
  const { body } = await buildSummary('2026-01-01');
  assert.strictEqual(body, 'No usage data recorded today.');
});

test('next 9 pm is later today, or tomorrow once it has passed', () => {
  const at = (h, m) => { const d = new Date(2026, 9, 28, h, m); return d; };
  assert.strictEqual(msUntilNext(21, at(20, 30)), 30 * 60 * 1000);
  assert.strictEqual(msUntilNext(21, at(21, 0)), 24 * 60 * 60 * 1000);
});
