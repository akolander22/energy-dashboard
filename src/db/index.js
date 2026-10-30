const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/energy.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_totals (
    date        TEXT PRIMARY KEY,
    emporia_kwh REAL,
    solar_wh    REAL,
    updated_at  TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS circuit_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_num TEXT NOT NULL,
    name        TEXT NOT NULL,
    kw          REAL NOT NULL,
    recorded_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_channel
    ON circuit_snapshots(channel_num, recorded_at);
`);

module.exports = db;
