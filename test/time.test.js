const test   = require('node:test');
const assert = require('node:assert');
const { localDate, localDateDaysAgo } = require('../src/lib/time');

const CHI = 'America/Chicago';

test('late evening Central stays on the same day', () => {
  // 2026-10-28 23:30 CDT is 2026-10-29 04:30 UTC
  const t = new Date('2026-10-29T04:30:00Z');
  assert.strictEqual(t.toISOString().slice(0, 10), '2026-10-29');
  assert.strictEqual(localDate(t, CHI), '2026-10-28');
});

test('9 pm Central in winter (CST)', () => {
  assert.strictEqual(localDate(new Date('2026-12-02T03:00:00Z'), CHI), '2026-12-01');
});

test('days ago crosses months and the DST change', () => {
  const t = new Date('2026-11-02T04:30:00Z'); // 2026-11-01 22:30 CST
  assert.strictEqual(localDateDaysAgo(0, t, CHI), '2026-11-01');
  assert.strictEqual(localDateDaysAgo(1, t, CHI), '2026-10-31');
  assert.strictEqual(localDateDaysAgo(14, t, CHI), '2026-10-18');
});
