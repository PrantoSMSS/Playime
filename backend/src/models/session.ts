/**
 * Session + message persistence (Phase 1, checklist item 2).
 *
 * A thin repository over `node:sqlite` (see src/db.ts for the connection).
 * Routes and the chat service go through these helpers — no raw SQL in
 * business code (AGENTS.md conventions).
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import type { AvatarOption, StartingScenario } from './character.js';

export type SessionClass = 'character' | 'story';

export interface SessionRow {
  id: string;
  class: SessionClass;
  created_at: number;
  provider: string;
  model: string | null;
  small_model: string | null;
  character_card_id: string | null;
  avatar_selection: string | null;
  starting_scenario_id: string | null;
  avatar_snapshot: AvatarOption | null;
  starting_scenario_snapshot: StartingScenario | null;
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
  /** Which avatar the user picked at New Play time. */
  avatar_selection?: string | undefined;
  /** Which starting scenario the user picked at New Play time. */
  starting_scenario_id?: string | undefined;
  /** Snapshot of the selected avatar option. */
  avatar_snapshot?: AvatarOption | undefined;
  /** Snapshot of the selected starting scenario. */
  starting_scenario_snapshot?: StartingScenario | undefined;
}

/** Create a session row; the id is generated here, not by SQLite. */
export function createSession(input: CreateSessionInput = {}): SessionRow {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  const sessionClass: SessionClass = input.class ?? 'character';
  const provider = input.provider ?? 'opencode';
  db.prepare(
    `INSERT INTO session (id, class, created_at, provider, character_card_id, avatar_selection, starting_scenario_id, avatar_snapshot, starting_scenario_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionClass,
    now,
    provider,
    input.character_card_id ?? null,
    input.avatar_selection ?? null,
    input.starting_scenario_id ?? null,
    input.avatar_snapshot ? JSON.stringify(input.avatar_snapshot) : null,
    input.starting_scenario_snapshot ? JSON.stringify(input.starting_scenario_snapshot) : null,
  );
  return {
    id,
    class: sessionClass,
    created_at: now,
    provider,
    model: null,
    small_model: null,
    character_card_id: input.character_card_id ?? null,
    avatar_selection: input.avatar_selection ?? null,
    starting_scenario_id: input.starting_scenario_id ?? null,
    avatar_snapshot: input.avatar_snapshot ?? null,
    starting_scenario_snapshot: input.starting_scenario_snapshot ?? null,
  };
}

export function getSession(id: string): SessionRow | undefined {
  const row = getDb()
    .prepare(
      'SELECT id, class, created_at, provider, model, small_model, character_card_id, avatar_selection, starting_scenario_id, avatar_snapshot, starting_scenario_snapshot FROM session WHERE id = ?',
    )
    .get(id) as unknown as SessionRowRaw | undefined;
  if (!row) return undefined;
  return {
    ...row,
    avatar_snapshot: parseJson<AvatarOption | null>(row.avatar_snapshot, null),
    starting_scenario_snapshot: parseJson<StartingScenario | null>(row.starting_scenario_snapshot, null),
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
  avatar_selection: string | null;
  starting_scenario_id: string | null;
  avatar_snapshot: string | null;
  starting_scenario_snapshot: string | null;
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
  const id = randomUUID();
  const visible = input.visible ?? 1;
  const ooc = input.ooc ?? 0;
  db.prepare(
    `INSERT INTO message (id, session_id, seq, role, content, created_at, visible, ooc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.session_id, input.seq, input.role, input.content, now, visible, ooc);
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
