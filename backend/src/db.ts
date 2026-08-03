/**
 * SQLite client for Playime.
 *
 * Uses the built-in `node:sqlite` driver (DatabaseSync) — no native
 * dependency, verified working on Node 24. The schema lives in
 * `db/schema.sql`; this module opens the database file and applies it.
 *
 * Playime owns ALL persistent state (sessions, messages, cards, memories)
 * in SQLite; the LM provider's own session history is never treated as
 * state (AGENTS.md "Core architectural rule").
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/** Directory containing schema.sql and (by default) the db file. */
const DB_DIR = fileURLToPath(new URL('../db/', import.meta.url));
const SCHEMA_PATH = join(DB_DIR, 'schema.sql');

/** Default database file location, overridable via PLAYIME_DB_PATH. */
export function defaultDbPath(): string {
  return process.env.PLAYIME_DB_PATH ?? join(DB_DIR, 'playime.db');
}

/**
 * Open (creating if needed) the database and ensure the schema is applied.
 * Each call returns an independent connection; use `getDb()` for the
 * process-wide singleton.
 */
export function openDb(dbPath: string = defaultDbPath()): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  runMigrations(db);
  return db;
}

/**
 * Run schema migrations for columns added after the initial schema.
 * Each ALTER TABLE is wrapped in a try/catch — if the column already exists,
 * the error is silently ignored (SQLite doesn't support IF NOT EXISTS on
 * ALTER TABLE).
 */
function runMigrations(db: DatabaseSync): void {
  const sessionColumns: [string, string][] = [
    ['character_card_id', 'TEXT REFERENCES character_card(id)'],
    ['avatar_selection', 'TEXT'],
    ['starting_scenario_id', 'TEXT'],
    ['avatar_snapshot', 'TEXT'],
    ['starting_scenario_snapshot', 'TEXT'],
  ];
  for (const [col, typedef] of sessionColumns) {
    try {
      db.exec(`ALTER TABLE session ADD COLUMN ${col} ${typedef}`);
    } catch {
      // Column already exists — ignore.
    }
  }

  const cardColumns: [string, string][] = [
    ['avatars', "TEXT NOT NULL DEFAULT '[]'"],
    ['starting_scenarios', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [col, typedef] of cardColumns) {
    try {
      db.exec(`ALTER TABLE character_card ADD COLUMN ${col} ${typedef}`);
    } catch {
      // Column already exists — ignore.
    }
  }
}

let singleton: DatabaseSync | undefined;

/** Process-wide shared connection (single local user for v1). */
export function getDb(): DatabaseSync {
  if (!singleton) singleton = openDb();
  return singleton;
}
