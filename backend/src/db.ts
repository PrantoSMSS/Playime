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
 * Run schema migrations for columns/tables added after the initial schema.
 *
 * Each ALTER TABLE is wrapped in a try/catch that only swallows the specific
 * "duplicate column name" error (column already exists). Other errors propagate.
 * CREATE TABLE IF NOT EXISTS is used where applicable.
 *
 * NOTE: When adding new columns, prefer adding them to schema.sql directly
 * (for fresh databases) AND adding a migration here (for existing databases).
 * Once all production databases have the column, the migration can be removed.
 */
function runMigrations(db: DatabaseSync): void {
  // ── Session table: persona snapshot fields ────────────────────────────
  // Added post-initial-schema; required for persona/starting-scenario support.
  const sessionColumns: [string, string][] = [
    ['persona_id', 'TEXT'],
    ['persona_snapshot', 'TEXT'],
    ['persona_source', 'TEXT'],
    ['favorite', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, typedef] of sessionColumns) {
    try {
      db.exec(`ALTER TABLE session ADD COLUMN ${col} ${typedef}`);
    } catch (err: unknown) {
      if (!isDuplicateColumnErr(err)) throw err;
    }
  }

  // ── Character card: modular card fields ───────────────────────────────
  // Added post-initial-schema; required for multi-avatar/scenario/cover support.
  const cardColumns: [string, string][] = [
    ['avatars', "TEXT NOT NULL DEFAULT '[]'"],
    ['starting_scenarios', "TEXT NOT NULL DEFAULT '[]'"],
    ['default_persona', 'TEXT'],
    ['avatar_file', 'TEXT'],
    ['cover_file', 'TEXT'],
    ['source', "TEXT NOT NULL DEFAULT 'playime'"],
    ['source_id', 'TEXT'],
    ['favorite', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, typedef] of cardColumns) {
    try {
      db.exec(`ALTER TABLE character_card ADD COLUMN ${col} ${typedef}`);
    } catch (err: unknown) {
      if (!isDuplicateColumnErr(err)) throw err;
    }
  }

  // ── Persona: avatar_file ──────────────────────────────────────────────
  // Added for local-file avatar support on personas.
  try {
    db.exec(`ALTER TABLE persona ADD COLUMN avatar_file TEXT`);
  } catch (err: unknown) {
    if (!isDuplicateColumnErr(err)) throw err;
  }

  // NOTE: reserveExistingIdSequences() is NOT called here.
  // It must run AFTER seed data is inserted (see index.ts main()).
}

/** Check if an error is SQLite's "duplicate column name" (column already exists). */
function isDuplicateColumnErr(err: unknown): boolean {
  return err instanceof Error && /duplicate column name/i.test(err.message);
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
/**
 * Scan existing entity tables and reserve sequence numbers in id_sequences.
 * MUST be called AFTER all seed/entity data has been inserted.
 * Idempotent — safe to call on every startup.
 */
export function reserveExistingIdSequences(db: DatabaseSync): void {
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
