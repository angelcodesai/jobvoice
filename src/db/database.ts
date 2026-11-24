import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('jobvoice.db');
    migrate(db);
  }
  return db;
}

function migrate(database: SQLite.SQLiteDatabase) {
  database.execSync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_address TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      transcript TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS line_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT '',
      unit_price REAL,
      low_confidence INTEGER NOT NULL DEFAULT 0,
      checked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL DEFAULT '',
      trade TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USD',
      tax_rate REAL NOT NULL DEFAULT 0,
      quote_terms TEXT NOT NULL DEFAULT 'Quote valid for 30 days.',
      quote_counter INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT NOT NULL DEFAULT '',
      onboarded INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO profile (id) VALUES (1);
  `);
  // Additive column migrations: a duplicate ALTER throws and is safely swallowed
  // (only installs created before the column existed need it).
  for (const ddl of [
    `ALTER TABLE profile ADD COLUMN last_sync_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE line_items ADD COLUMN checked INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE profile ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try { database.execSync(ddl); } catch { /* column exists */ }
  }
}
