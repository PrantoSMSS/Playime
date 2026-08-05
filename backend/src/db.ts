/**
 * SQLite client for Playime.
 *
 * Uses the built-in `node:sqlite` driver (DatabaseSync) — no native
 * dependency, verified working on Node 24. The schema lives in
 * `db/schema.sql`; this module opens the database file and applies it.
 *
 * Playime owns ALL persistent state (sessions, messages, cards, memories)
 * in SQLite; the LM provider's own session history is never treated as
 * state (CLAUDE.md "Core architectural rule").
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/** Directory containing schema.sql (schema lives alongside db.ts in src/../db). */
const DB_DIR = fileURLToPath(new URL('../db/', import.meta.url));
const SCHEMA_PATH = join(DB_DIR, 'schema.sql');

/** Data directory — holds the database and entity files. */
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

/** Default database file location, overridable via PLAYIME_DB_PATH. */
export function defaultDbPath(): string {
  return process.env.PLAYIME_DB_PATH ?? join(DATA_DIR, 'playime.db');
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
    ['persona_id', 'TEXT'],
    ['persona_snapshot', 'TEXT'],
    ['persona_source', 'TEXT'],
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
    ['default_persona', 'TEXT'],
    ['avatar_file', 'TEXT'],
    ['cover_file', 'TEXT'],
  ];
  for (const [col, typedef] of cardColumns) {
    try {
      db.exec(`ALTER TABLE character_card ADD COLUMN ${col} ${typedef}`);
    } catch {
      // Column already exists — ignore.
    }
  }

  // Persona table — created via schema.sql, but ensure it exists for older DBs
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS persona (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      description TEXT NOT NULL DEFAULT '',
      appearance TEXT NOT NULL DEFAULT '',
      personality TEXT NOT NULL DEFAULT '',
      pronouns TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  } catch {
    // Table already exists — ignore.
  }

  // Add avatar_file to persona for existing DBs
  try {
    db.exec(`ALTER TABLE persona ADD COLUMN avatar_file TEXT`);
  } catch {
    // Column already exists — ignore.
  }

  // id_sequences table — ensure it exists for older DBs
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS id_sequences (
      type      TEXT NOT NULL,
      slug      TEXT NOT NULL,
      next_seq  INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (type, slug)
    )`);
  } catch {
    // Table already exists — ignore.
  }

  // source / source_id columns on character_card
  try {
    db.exec(`ALTER TABLE character_card ADD COLUMN source TEXT NOT NULL DEFAULT 'playime'`);
  } catch {
    // Column already exists — ignore.
  }
  try {
    db.exec(`ALTER TABLE character_card ADD COLUMN source_id TEXT`);
  } catch {
    // Column already exists — ignore.
  }

  // Reserve sequence numbers from existing IDs so future allocateId() calls don't collide.
  // This MUST run after seed data is inserted so it can see seed IDs.
  reserveExistingIdSequences(db);
}

/**
 * Scan existing entity tables and reserve sequence numbers in id_sequences.
 *
 * For each (type, slug) pair, finds the MAXIMUM existing sequence number
 * and sets next_seq to max + 1. This handles multiple existing IDs per slug
 * (e.g. char_yehwa_0001, char_yehwa_0002, char_yehwa_0007 → next_seq = 8).
 *
 * Idempotent — existing counters are only advanced, never reduced.
 * Uses MAX(next_seq, excluded.next_seq) so re-running won't lower a counter.
 *
 * Only matches IDs prefixed with the expected type for that table
 * (e.g. char_... in character_card, not persona_... in character_card).
 *
 * Note: 'story' type is declared in EntityType for future use but has no
 * story_card table yet — it is not migrated here.
 */
function reserveExistingIdSequences(db: DatabaseSync): void {
  const patterns: Array<{ type: string; table: string; hasSlug: boolean }> = [
    { type: 'char', table: 'character_card', hasSlug: true },
    { type: 'persona', table: 'persona', hasSlug: true },
    { type: 'sess', table: 'session', hasSlug: false },
    { type: 'msg', table: 'message', hasSlug: false },
  ];

  for (const { type, table, hasSlug } of patterns) {
    // Only process tables that exist
    const tableExists = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(table);
    if (!tableExists) continue;

    const rows = db.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>;

    // Collect the MAXIMUM sequence per slug
    const maxSequences = new Map<string, number>();

    for (const { id } of rows) {
      // Only match IDs with the EXPECTED type prefix for this table
      const match = hasSlug
        ? id.match(new RegExp(`^${type}_([a-z0-9-]+)_(\\d+)$`))
        : id.match(new RegExp(`^${type}_(\\d+)$`));

      if (!match) {
        // Legacy ID that doesn't match the structured format (e.g. raw UUIDs
        // like 'yehwa' or '215fb191-...'). Reserve one sequence slot to
        // prevent allocateId from generating a colliding ID. We use the
        // special slug '_legacy' for all non-matching IDs of a given type.
        maxSequences.set('_legacy', (maxSequences.get('_legacy') ?? 0) + 1);
        continue;
      }

      const slug = hasSlug ? (match[1] ?? '') : '';
      const seq = Number(match[hasSlug ? 2 : 1] ?? '0');

      if (!Number.isSafeInteger(seq) || seq < 1) continue;

      maxSequences.set(slug, Math.max(maxSequences.get(slug) ?? 0, seq));
    }

    // Upsert with MAX — only advance counters, never reduce
    const upsert = db.prepare(`
      INSERT INTO id_sequences (type, slug, next_seq)
      VALUES (?, ?, ?)
      ON CONFLICT (type, slug)
      DO UPDATE SET next_seq = MAX(id_sequences.next_seq, excluded.next_seq)
    `);

    for (const [slug, maxSeq] of maxSequences) {
      upsert.run(type, slug, maxSeq + 1);
    }
  }
}

let singleton: DatabaseSync | undefined;

/** Process-wide shared connection (single local user for v1). */
export function getDb(): DatabaseSync {
  if (!singleton) singleton = openDb();
  return singleton;
}
