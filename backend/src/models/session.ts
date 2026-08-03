/**
 * Session + message persistence (Phase 1, checklist item 2).
 *
 * A thin repository over `node:sqlite` (see src/db.ts for the connection).
 * Routes and the chat service go through these helpers — no raw SQL in
 * business code (AGENTS.md conventions).
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

export type SessionClass = 'character' | 'story';

export interface SessionRow {
  id: string;
  class: SessionClass;
  created_at: number;
  provider: string;
  model: string | null;
  small_model: string | null;
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
}

/** Create a session row; the id is generated here, not by SQLite. */
export function createSession(input: CreateSessionInput = {}): SessionRow {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  const sessionClass: SessionClass = input.class ?? 'character';
  const provider = input.provider ?? 'opencode';
  db.prepare(
    'INSERT INTO session (id, class, created_at, provider) VALUES (?, ?, ?, ?)',
  ).run(id, sessionClass, now, provider);
  return { id, class: sessionClass, created_at: now, provider, model: null, small_model: null };
}

export function getSession(id: string): SessionRow | undefined {
  const row = getDb()
    .prepare('SELECT id, class, created_at, provider, model, small_model FROM session WHERE id = ?')
    .get(id) as unknown as SessionRow | undefined;
  return row;
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
