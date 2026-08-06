/**
 * Persona — the user's reusable identity for roleplay.
 *
 * A Persona represents who the user is playing as in a conversation,
 * NOT a variant of the AI character's appearance. CharacterCard.avatar
 * remains the AI character's image; Persona.avatar is the user's image.
 *
 * Personas are reusable across multiple Characters, Stories, and Sessions.
 * A Session references a Persona via persona_id and stores a persona_snapshot
 * at creation time for historical consistency.
 */
import { getDb } from '../db.js';
import { allocateId } from '../id.js';
import { ensureEntityDir, normalizeAvatarPath } from '../storage.js';

// ── Types ──────────────────────────────────────────────────────────────

/** A user's reusable roleplay identity. */
export interface Persona {
  id: string;
  name: string;
  /** User's profile image (URL or data URI). */
  avatar: string | null;
  /** Local filename (e.g. "avatar.png"), resolved to full path on read. */
  avatar_file: string | null;
  /** Short role description, e.g. "Apprentice Mage". */
  description: string;
  /** Physical appearance for prompt context. */
  appearance: string;
  /** Personality traits for prompt context. */
  personality: string;
  /** Pronouns, e.g. "she/her". */
  pronouns: string;
  created_at: number;
  updated_at: number;
}

// ── CRUD ───────────────────────────────────────────────────────────────

/** Parse a JSON column, returning a fallback on null/empty/malformed. */
function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Row shape as stored in SQLite. */
interface PersonaRow {
  id: string;
  name: string;
  avatar: string | null;
  avatar_file: string | null;
  description: string;
  appearance: string;
  personality: string;
  pronouns: string;
  created_at: number;
  updated_at: number;
}

function rowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    avatar_file: normalizeAvatarPath(row.avatar_file, row.id, 'personas'),
    description: row.description,
    appearance: row.appearance,
    personality: row.personality,
    pronouns: row.pronouns,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_COLS = [
  'id', 'name', 'avatar', 'avatar_file', 'description', 'appearance',
  'personality', 'pronouns', 'created_at', 'updated_at',
].join(', ');

/** List all personas, newest first. */
export function listPersonas(): Persona[] {
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM persona ORDER BY created_at DESC`)
    .all() as unknown as PersonaRow[];
  return rows.map(rowToPersona);
}

/** Get a single persona by id, or undefined. */
export function getPersona(id: string): Persona | undefined {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM persona WHERE id = ?`)
    .get(id) as unknown as PersonaRow | undefined;
  return row ? rowToPersona(row) : undefined;
}

/** Input for creating a new persona. Only `name` is required. */
export interface CreatePersonaInput {
  name: string;
  avatar?: string | undefined;
  avatar_file?: string | null | undefined;
  description?: string | undefined;
  appearance?: string | undefined;
  personality?: string | undefined;
  pronouns?: string | undefined;
}

/** Create a persona, returning the full row. */
export function createPersona(input: CreatePersonaInput): Persona {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'persona', input.name);

    db.prepare(
      `INSERT INTO persona (id, name, avatar, avatar_file, description, appearance, personality, pronouns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.avatar ?? null,
      input.avatar_file ?? null,
      input.description ?? '',
      input.appearance ?? '',
      input.personality ?? '',
      input.pronouns ?? '',
      now,
      now,
    );

    db.exec('COMMIT');
    ensureEntityDir('personas', id);
    return getPersona(id)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Partial patch for updating a persona. All fields optional. */
export interface UpdatePersonaInput {
  name?: string | undefined;
  avatar?: string | null | undefined;
  avatar_file?: string | null | undefined;
  description?: string | undefined;
  appearance?: string | undefined;
  personality?: string | undefined;
  pronouns?: string | undefined;
}

/**
 * Update a persona by id. Returns the updated persona, or undefined
 * if the id doesn't exist. Only provided fields are written.
 */
export function updatePersona(
  id: string,
  patch: UpdatePersonaInput,
): Persona | undefined {
  const existing = getPersona(id);
  if (!existing) return undefined;

  const db = getDb();
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(val as string | number | null);
  }

  values.push(id);
  db.prepare(`UPDATE persona SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getPersona(id);
}

/**
 * Delete a persona by id. Returns true if a row was deleted.
 */
export function deletePersona(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM persona WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

/**
 * Count sessions referencing a persona.
 */
export function countSessionsForPersona(personaId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS cnt FROM session WHERE persona_id = ?')
    .get(personaId) as { cnt: number };
  return row.cnt;
}

// ── Default persona ────────────────────────────────────────────────────

/**
 * The built-in "Myself" persona — always available as the default option
 * when no other personas exist. Not stored in the DB; created on the fly.
 */
export const DEFAULT_PERSONA: Persona = {
  id: 'myself',
  name: 'Myself',
  avatar: null,
  avatar_file: null,
  description: 'Default persona — just me',
  appearance: '',
  personality: '',
  pronouns: '',
  created_at: 0,
  updated_at: 0,
};
