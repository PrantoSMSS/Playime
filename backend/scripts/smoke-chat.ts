/**
 * End-to-end smoke test for the Phase 1 chat loop (checklist item 2).
 *
 * Points PLAYIME_DB_PATH at a throwaway DB, boots a Fastify app with the
 * real chat routes, and drives it over HTTP via app.inject() against the
 * live opencode server (must be running on 127.0.0.1:4096 — see
 * docs/setup-opencode.md). Asserts:
 *   - session create returns a character session (201)
 *   - a message round-trip returns a non-empty assistant reply (201)
 *   - history accumulates in the DB across turns (full-history-in-context)
 *   - an OOC turn is accepted, flagged in the DB, and still replies
 *   - unknown session → 404, invalid body → 400
 *
 * Usage: npm run smoke:chat   (backend/)
 */
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE the chat service first opens it.
const dir = mkdtempSync(join(tmpdir(), 'playime-chat-'));
process.env.PLAYIME_DB_PATH = join(dir, 'test.db');

import { chatRoutes } from '../src/routes/chat.js';
import { getDb } from '../src/db.js';
import { listTurns } from '../src/models/session.js';

interface SessionResponse {
  id: string;
  class: string;
  created_at: number;
}

interface MessageResponse {
  message: { id: string; role: string; content: string; seq: number };
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

/** True when the reply looks in-character — not leaking coding-agent framing. */
function isInCharacter(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    !lower.includes('coding agent') &&
    !lower.includes('playime') &&
    !lower.includes('repository') &&
    !lower.includes('the repo')
  );
}

async function main(): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(chatRoutes);
  await app.ready();

  // 1. Create a session.
  const created = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: { class: 'character' },
  });
  assert(created.statusCode === 201, `session create status ${created.statusCode}`);
  const session = created.json() as SessionResponse;
  assert(session.class === 'character' && typeof session.id === 'string', 'session create body');

  // 2. First round-trip: user turn → assistant reply.
  const first = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: { content: "Hi! What's your name?" },
  });
  assert(first.statusCode === 201, `first message status ${first.statusCode}`);
  const firstReply = (first.json() as MessageResponse).message;
  assert(firstReply.role === 'assistant', 'first reply is assistant');
  assert(firstReply.content.trim().length > 0, 'first reply non-empty');
  assert(isInCharacter(firstReply.content), `first reply in character: '${firstReply.content}'`);

  // 3. Second turn — assembled with the full history in context.
  const second = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: { content: 'What was the first thing I asked you?' },
  });
  assert(second.statusCode === 201, `second message status ${second.statusCode}`);
  const secondReply = (second.json() as MessageResponse).message;
  assert(secondReply.content.trim().length > 0, 'second reply non-empty');
  assert(
    isInCharacter(secondReply.content),
    `second reply in character: '${secondReply.content}'`,
  );

  // 4. DB state: user, assistant, user, assistant (seq 0..3).
  const turns = listTurns(session.id);
  assert(turns.length === 4, `expected 4 visible turns, got ${turns.length}`);
  const roles = turns.map((t) => t.role).join(',');
  assert(roles === 'user,assistant,user,assistant', `role order '${roles}'`);
  console.log('  user(0)      →', turns[0]?.content);
  console.log('  assistant(1) →', turns[1]?.content.slice(0, 100));
  console.log('  user(2)      →', turns[2]?.content);
  console.log('  assistant(3) →', turns[3]?.content.slice(0, 100));

  // 5. OOC turn: accepted, flagged, excluded from fiction, still replies.
  const ooc = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: { content: '(ooc: answer in exactly three words)', ooc: true },
  });
  assert(ooc.statusCode === 201, `ooc status ${ooc.statusCode}`);
  const oocReply = (ooc.json() as MessageResponse).message;
  assert(oocReply.content.trim().length > 0, 'ooc reply non-empty');
  const after = listTurns(session.id);
  assert(after.length === 6, `expected 6 visible turns, got ${after.length}`);
  assert(after.some((t) => t.ooc === 1), 'ooc turn flagged in db');
  console.log('  ooc user(4)  →', after[4]?.content);
  console.log('  assistant(5) →', after[5]?.content.slice(0, 100));

  // 6. Asterisk-wrapped text auto-flags as an OOC stage direction.
  const stage = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: { content: '*then Miko bows politely*' },
  });
  assert(stage.statusCode === 201, `stage-direction status ${stage.statusCode}`);
  const stageReply = (stage.json() as MessageResponse).message;
  assert(stageReply.content.trim().length > 0, 'stage-direction reply non-empty');
  assert(
    isInCharacter(stageReply.content),
    `stage-direction reply in character: '${stageReply.content}'`,
  );
  const withStage = listTurns(session.id);
  assert(withStage.length === 8, `expected 8 visible turns, got ${withStage.length}`);
  const stageMsg = withStage.find((t) => t.content.includes('bows politely'));
  assert(stageMsg?.ooc === 1, 'asterisk-wrapped message flagged ooc in db');
  console.log('  stage user(6) →', withStage[6]?.content);
  console.log('  assistant(7) →', withStage[7]?.content.slice(0, 100));

  // 7. Inline emphasis (*smiles*) is NOT an OOC marker — stays in-fiction.
  const emphasis = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: { content: 'Miko *smiles* warmly' },
  });
  assert(emphasis.statusCode === 201, `emphasis status ${emphasis.statusCode}`);
  const emphasisReply = (emphasis.json() as MessageResponse).message;
  assert(emphasisReply.content.trim().length > 0, 'emphasis reply non-empty');
  const withEmphasis = listTurns(session.id);
  assert(withEmphasis.length === 10, `expected 10 visible turns, got ${withEmphasis.length}`);
  const emphasisMsg = withEmphasis.find((t) => t.content.includes('*smiles*'));
  assert(emphasisMsg?.ooc === 0, 'inline emphasis must NOT be flagged ooc');

  // 8. Error paths.
  const missing = await app.inject({
    method: 'POST',
    url: '/api/sessions/does-not-exist/messages',
    payload: { content: 'hi' },
  });
  assert(missing.statusCode === 404, `unknown session → 404, got ${missing.statusCode}`);
  const badBody = await app.inject({
    method: 'POST',
    url: `/api/sessions/${session.id}/messages`,
    payload: {},
  });
  assert(badBody.statusCode === 400, `missing content → 400, got ${badBody.statusCode}`);

  await app.close();
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
  console.log('SMOKE CHAT PASSED');
}

main().catch((err) => {
  console.error('SMOKE CHAT FAILED:', err);
  process.exit(1);
});
