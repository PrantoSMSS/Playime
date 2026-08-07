/**
 * Session + message persistence (Phase 1, checklist item 2).
 *
 * A thin repository over `node:sqlite` (see src/db.ts for the connection).
 * Routes and the chat service go through these helpers — no raw SQL in
 * business code (CLAUDE.md conventions).
 */
import { getDb } from '../db.js';
import { allocateId } from '../id.js';
import type { AvatarOption, StartingScenario } from './character.js';
import type { Persona } from './persona.js';

export type SessionClass = 'character' | 'story';

export interface SessionRow {
  id: string;
  class: SessionClass;
  created_at: number;
  provider: string;
  model: string | null;
  small_model: string | null;
  character_card_id: string | null;
  story_card_id: string | null;
  avatar_selection: string | null;
  starting_scenario_id: string | null;
  avatar_snapshot: AvatarOption | null;
  starting_scenario_snapshot: StartingScenario | null;
  persona_id: string | null;
  persona_snapshot: Persona | null;
  /** "default" = resolved from card's default_persona + player_name; "custom" = from persona library. */
  persona_source: string | null;
  /** Per-session snapshot of the story's quest_log (QuestEntry[]). */
  quest_log_state: string | null;
  /** 1 = user has marked this session as favorite. */
  favorite: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  visible: number;
  ooc: number;
}

export interface CreateSessionInput {
  class?: SessionClass | undefined;
  provider?: string | undefined;
  /** Link this session to a character card (Phase 2 "New Play" flow). */
  character_card_id?: string | undefined;
  /** Link this session to a story card (Phase 4 "New Play" flow). */
  story_card_id?: string | undefined;
  /** Which avatar the user picked at New Play time. */
  avatar_selection?: string | undefined;
  /** Which starting scenario the user picked at New Play time. */
  starting_scenario_id?: string | undefined;
  /** Snapshot of the selected avatar option. */
  avatar_snapshot?: AvatarOption | undefined;
  /** Snapshot of the selected starting scenario. */
  starting_scenario_snapshot?: StartingScenario | undefined;
  /** Which persona (user identity) the user picked. */
  persona_id?: string | undefined;
  /** Snapshot of the resolved Persona (either from scenario default or custom). */
  persona_snapshot?: Persona | undefined;
  /** "default" = resolved from card's default_persona; "custom" = from persona library. */
  persona_source?: string | undefined;
  /** Per-session snapshot of the story's quest_log (QuestEntry[]). */
  quest_log_state?: string | undefined;
}

/** Create a session row; the id is generated here, not by SQLite. */
export function createSession(input: CreateSessionInput = {}): SessionRow {
  const db = getDb();
  const now = Date.now();
  const sessionClass: SessionClass = input.class ?? 'character';
  const provider = input.provider ?? 'opencode';

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'sess');
    db.prepare(
      `INSERT INTO session (id, class, created_at, provider, character_card_id, story_card_id, avatar_selection, starting_scenario_id, avatar_snapshot, starting_scenario_snapshot, persona_id, persona_snapshot, persona_source, quest_log_state, favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sessionClass,
      now,
      provider,
      input.character_card_id ?? null,
      input.story_card_id ?? null,
      input.avatar_selection ?? null,
      input.starting_scenario_id ?? null,
      input.avatar_snapshot ? JSON.stringify(input.avatar_snapshot) : null,
      input.starting_scenario_snapshot ? JSON.stringify(input.starting_scenario_snapshot) : null,
      input.persona_id ?? null,
      input.persona_snapshot ? JSON.stringify(input.persona_snapshot) : null,
      input.persona_source ?? null,
      input.quest_log_state ?? null,
      0,
    );
    db.exec('COMMIT');
    return {
      id,
      class: sessionClass,
      created_at: now,
      provider,
      model: null,
      small_model: null,
      character_card_id: input.character_card_id ?? null,
      story_card_id: input.story_card_id ?? null,
      avatar_selection: input.avatar_selection ?? null,
      starting_scenario_id: input.starting_scenario_id ?? null,
      avatar_snapshot: input.avatar_snapshot ?? null,
      starting_scenario_snapshot: input.starting_scenario_snapshot ?? null,
      persona_id: input.persona_id ?? null,
      persona_snapshot: input.persona_snapshot ?? null,
      persona_source: input.persona_source ?? null,
      quest_log_state: input.quest_log_state ?? null,
      favorite: 0,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSession(id: string): SessionRow | undefined {
  const row = getDb()
    .prepare(
      'SELECT id, class, created_at, provider, model, small_model, character_card_id, story_card_id, avatar_selection, starting_scenario_id, avatar_snapshot, starting_scenario_snapshot, persona_id, persona_snapshot, persona_source, quest_log_state, favorite FROM session WHERE id = ?',
    )
    .get(id) as unknown as SessionRowRaw | undefined;
  if (!row) return undefined;
  return {
    ...row,
    avatar_snapshot: parseJson<AvatarOption | null>(row.avatar_snapshot, null),
    starting_scenario_snapshot: parseJson<StartingScenario | null>(row.starting_scenario_snapshot, null),
    persona_snapshot: parseJson<Persona | null>(row.persona_snapshot, null),
  };
}

/** Raw row shape from SQLite (JSON columns are strings). */
interface SessionRowRaw {
  id: string;
  class: SessionClass;
  created_at: number;
  provider: string;
  model: string | null;
  small_model: string | null;
  character_card_id: string | null;
  story_card_id: string | null;
  avatar_selection: string | null;
  starting_scenario_id: string | null;
  avatar_snapshot: string | null;
  starting_scenario_snapshot: string | null;
  persona_id: string | null;
  persona_snapshot: string | null;
  persona_source: string | null;
  quest_log_state: string | null;
  favorite: number;
}

/** Parse a JSON column, returning a fallback on null/empty/malformed. */
function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** List all sessions, newest first. */
export function listSessions(): SessionRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, class, created_at, provider, model, small_model, character_card_id, story_card_id, avatar_selection, starting_scenario_id, avatar_snapshot, starting_scenario_snapshot, persona_id, persona_snapshot, persona_source, quest_log_state, favorite
       FROM session
       ORDER BY created_at DESC`,
    )
    .all() as unknown as SessionRowRaw[];
  return rows.map((row) => ({
    ...row,
    avatar_snapshot: parseJson<AvatarOption | null>(row.avatar_snapshot, null),
    starting_scenario_snapshot: parseJson<StartingScenario | null>(row.starting_scenario_snapshot, null),
    persona_snapshot: parseJson<Persona | null>(row.persona_snapshot, null),
  }));
}

/** Next per-session sequence number for a message (seq is 0-based per session). */
export function nextMessageSeq(sessionId: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(seq), -1) + 1 AS seq FROM message WHERE session_id = ?')
    .get(sessionId) as unknown as { seq: number };
  return row.seq;
}

export interface InsertMessageInput {
  session_id: string;
  seq: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  visible?: number | undefined; // 1 (default) or 0 — 0 hides bookkeeping turns
  ooc?: number | undefined;     // 1 or 0 (default) — out-of-character aside
}

/** Insert a message row, returning the full stored row. */
export function insertMessage(input: InsertMessageInput): MessageRow {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'msg');
    const visible = input.visible ?? 1;
    const ooc = input.ooc ?? 0;
    db.prepare(
      `INSERT INTO message (id, session_id, seq, role, content, created_at, visible, ooc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.session_id, input.seq, input.role, input.content, now, visible, ooc);
    db.exec('COMMIT');
    return {
      id,
      session_id: input.session_id,
      seq: input.seq,
      role: input.role,
      content: input.content,
      created_at: now,
      visible,
      ooc,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * All visible user/assistant turns for a session, oldest → newest.
 * Hidden (bookkeeping) rows and system turns are excluded — those never
 * enter the fiction context (docs/PLAYIME_PROMPT_SPEC.md §3).
 */
export function listTurns(sessionId: string): MessageRow[] {
  return getDb()
    .prepare(
      `SELECT id, session_id, seq, role, content, created_at, visible, ooc
       FROM message
       WHERE session_id = ? AND visible = 1 AND role IN ('user', 'assistant')
       ORDER BY seq`,
    )
    .all(sessionId) as unknown as MessageRow[];
}

/** Delete a session and its messages (cascade via FK). */
export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM session WHERE id = ?').run(id);
}

/** Partial patch for updating a session. */
export interface UpdateSessionInput {
  favorite?: number | undefined;
}

/**
 * Update a session by id. Returns the updated session, or undefined
 * if the id doesn't exist. Only provided fields are written.
 */
export function updateSession(
  id: string,
  patch: UpdateSessionInput,
): SessionRow | undefined {
  const existing = getSession(id);
  if (!existing) return undefined;

  const db = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(val);
  }

  if (sets.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE session SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getSession(id);
}

/** Delete all messages for a session. */
export function deleteMessages(sessionId: string): void {
  getDb().prepare('DELETE FROM message WHERE session_id = ?').run(sessionId);
}
