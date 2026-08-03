/**
 * Sanity check for the SQLite schema (Phase 1 checklist item).
 *
 * Opens a throwaway DB in the OS temp dir, applies the schema, inserts a
 * session + messages (including an OOC turn and a hidden bookkeeping turn),
 * verifies ordering and cascade delete, then cleans up.
 *
 * Usage: npm run db:check   (backend/)
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb } from '../src/db.js';

interface MsgRow {
  role: string;
  content: string;
  visible: number;
  ooc: number;
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'playime-db-'));
  const dbPath = join(dir, 'test.db');
  const db = openDb(dbPath);

  const sessionId = randomUUID();
  db.prepare(
    'INSERT INTO session (id, class, created_at, provider, model) VALUES (?, ?, ?, ?, ?)',
  ).run(sessionId, 'character', Date.now(), 'opencode', 'deepseek-v4-flash-free');

  const insertMsg = db.prepare(
    `INSERT INTO message (id, session_id, seq, role, content, created_at, visible, ooc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertMsg.run(randomUUID(), sessionId, 0, 'user', 'Hello there!', Date.now(), 1, 0);
  insertMsg.run(randomUUID(), sessionId, 1, 'assistant', 'Hi! How are you?', Date.now(), 1, 0);
  insertMsg.run(randomUUID(), sessionId, 2, 'user', '(skip ahead a day)', Date.now(), 1, 1); // OOC
  insertMsg.run(randomUUID(), sessionId, 3, 'system', '{"state extraction"}', Date.now(), 0, 0); // hidden bookkeeping

  const msgs = db
    .prepare('SELECT role, content, visible, ooc FROM message WHERE session_id = ? ORDER BY seq')
    .all(sessionId) as unknown as MsgRow[];

  console.log(`messages in session: ${msgs.length} (expect 4)`);
  for (const m of msgs) {
    const tags = [m.role, m.ooc ? 'ooc' : '', m.visible ? '' : 'hidden'].filter(Boolean).join(',');
    console.log(`  [${tags}] ${m.content}`);
  }

  // Ordering must be preserved (ooc + hidden turns keep their positions).
  if (msgs[0]?.content !== 'Hello there!' || msgs[3]?.content !== '{"state extraction"}') {
    throw new Error('message ordering by seq is wrong');
  }
  if (msgs[1]?.ooc !== 0 || msgs[2]?.ooc !== 1) throw new Error('ooc flag not stored');
  if (msgs[3]?.visible !== 0) throw new Error('visible flag not stored');

  // Cascade delete: removing the session removes its messages.
  db.prepare('DELETE FROM session WHERE id = ?').run(sessionId);
  const remaining = db
    .prepare('SELECT COUNT(*) AS n FROM message WHERE session_id = ?')
    .get(sessionId) as unknown as { n: number };
  console.log(`messages after session delete: ${remaining.n} (expect 0)`);
  if (remaining.n !== 0) throw new Error('cascade delete failed');

  db.close();
  rmSync(dir, { recursive: true, force: true });
  console.log('DB CHECK PASSED');
}

try {
  main();
} catch (err) {
  console.error('DB CHECK FAILED:', err);
  process.exitCode = 1;
}
