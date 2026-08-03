/**
 * Long-conversation sanity check (checklist item 31).
 *
 * Boots a real Fastify app with the chat routes on a throwaway DB and drives a
 * 20+ turn in-fiction conversation with Yehwa through the live opencode server
 * (must be running on 127.0.0.1:4096 — see docs/setup-opencode.md). Asserts:
 *   - every turn round-trips (201) with a non-empty, in-character reply
 *   - the full transcript persists in SQLite (46 rows, roles alternate)
 *   - the request the model receives stays CAPPED at the 12-turn working
 *     context no matter how long the history grows (no context-length crash)
 *   - the final reply tracks the immediately preceding user turn (coherent,
 *     not boilerplate)
 *   - a within-window detail planted earlier is recalled (soft — printed, not
 *     failed; model output is nondeterministic)
 *
 * The last turn inspects the assembled request directly via `prepareTurn`
 * (same composition the route uses) so the context cap is observable — the
 * HTTP route never exposes the request.
 *
 * Usage: npm run smoke:longchat   (backend/)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE the chat service first opens it.
const dir = mkdtempSync(join(tmpdir(), 'playime-longchat-'));
process.env.PLAYIME_DB_PATH = join(dir, 'test.db');

import Fastify from 'fastify';
import { chatRoutes } from '../src/routes/chat.js';
import { getDb } from '../src/db.js';
import { listTurns } from '../src/models/session.js';
import { prepareTurn, persistAssistantReply } from '../src/chat.js';
import { createAdapter } from '../src/adapters/factory.js';

interface SessionResponse {
  id: string;
  class: string;
  created_at: number;
}

interface MessageResponse {
  user_message: { id: string; role: string; content: string; seq: number };
  message: { id: string; role: string; content: string; seq: number };
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

/** True when the reply looks in-character — no coding-agent or AI framing. */
function isInCharacter(text: string): boolean {
  const lower = text.toLowerCase();
  const bad = [
    'coding agent',
    'playime',
    'repository',
    'the repo',
    'as an ai',
    "i'm an ai",
    'ai assistant',
    'language model',
  ];
  return !bad.some((b) => lower.includes(b));
}

/** Content words of a string — lowercase, punctuation stripped, no stopwords. */
function contentWords(text: string): Set<string> {
  const STOP = new Set([
    'the', 'a', 'an', 'to', 'of', 'and', 'for', 'in', 'on', 'at', 'with',
    'i', 'my', 'me', 'you', 'your', 'it', 'is', 'was', 'are', 'were', 'be',
    'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
    'could', 'should', 'that', 'this', 'what', 'when', 'where', 'which', 'who',
    'how', 'there', 'from', 'as', 'so', 'but', 'not', 'no', 'yes', 'or',
    'about', 'after', 'before', 'if', 'then', 'than', 'just', 'all', 'one',
    'two', 'very', 'much', 'little', 'some', 'any', 'senior',
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP.has(w)),
  );
}

/**
 * 22 in-fiction user turns (the inspection turn below is #23). The arc
 * plants a within-window detail at turn 12 (iron rings) and calls it back at
 * turn 16; the final HTTP turn (#22) gives the inspection turn something
 * specific to track.
 */
const SCRIPT = [
  'Good evening, Senior. The training pavilion feels emptier than usual tonight.',
  "I've been meaning to ask — what should I call you? Just 'Senior' feels too formal for a first name.",
  'Master Jeong mentioned you once broke a wooden sword over your knee. Is that story true?',
  'I have been reading the manual on the seven-breath stance. The part about grounding through the heels is confusing.',
  'Do you think the plum blossoms on the east wall are early this year? They seem close to blooming.',
  'I found an old scroll in the library about inner strength that mentions breathing from the dantian.',
  "My wrist has been aching after drills. Master Jeong said it is the way I am gripping the sword.",
  'You once told me the key to the iron palm is not force but timing. I keep forgetting that.',
  'I made tea this afternoon — the same plum blossom blend you like. There is a cup waiting for you.',
  'The moon is bright tonight over the training yard. It makes the sand look like silver.',
  'Senior, do you ever miss the mountain before you joined the sect? It must have been peaceful.',
  'I started practicing with iron rings on my wrists during forms — they are heavy, but they build the grip.',
  'The rings are starting to leave marks on my forearms. Master Jeong said that is normal.',
  'I think I finally understand what you meant about timing. It is about patience, is it not?',
  'Would you mind watching my form tomorrow at dawn and telling me what I am doing wrong?',
  'What do you remember about what I mentioned a few turns ago — about my wrists?',
  "I will take the rings off before I spar with anyone. I do not want to hurt them by accident.",
  'Thank you for humoring all my questions tonight, Senior. It means a lot.',
  'I think the iron palm training is making my forearms stronger. I can feel the difference already.',
  "One more question and then I will stop: how long did it take you to master the seven-breath stance?",
  "I am going to go to bed soon. It has been a long day of training.",
  'I think I will go sit on the east wall and watch the moon rise for a while before I sleep.',
];

async function main(): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(chatRoutes);
  await app.ready();

  // Own adapter for the inspection turn (the route's adapter is internal);
  // disposed here, the route's is disposed via its onClose hook.
  const adapter = createAdapter({ id: 'opencode' });

  try {
    // 1. Create a session.
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { class: 'character' },
    });
    assert(created.statusCode === 201, `session create status ${created.statusCode}`);
    const session = created.json() as SessionResponse;
    assert(session.class === 'character' && typeof session.id === 'string', 'session create body');

    // 2. Turns 1–22 over HTTP. Assert each round-trips cleanly.
    console.log('=== transcript ===');
    for (let i = 0; i < SCRIPT.length; i++) {
      const turn = i + 1;
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/messages`,
        payload: { content: SCRIPT[i] },
      });
      assert(res.statusCode === 201, `turn ${turn} status ${res.statusCode}`);
      const body = res.json() as MessageResponse;
      assert(body.user_message.role === 'user', `turn ${turn} echoes the user turn`);
      const reply = body.message;
      assert(reply.role === 'assistant', `turn ${turn} reply is assistant`);
      assert(reply.content.trim().length > 0, `turn ${turn} reply non-empty`);
      assert(isInCharacter(reply.content), `turn ${turn} reply in character: '${reply.content}'`);

      console.log(`user(${2 * (turn - 1)})      → ${SCRIPT[i]}`);
      console.log(
        `  assistant(${2 * turn - 1}) → ${reply.content.replace(/\s+/g, ' ').slice(0, 140)}`,
      );

      // Soft recall check: turn 16 calls back the iron-rings detail from turn 12.
      if (turn === 16) {
        const recalled = /ring/i.test(reply.content);
        console.log(
          `  [soft] turn-12 detail ("iron rings") recalled at turn 16: ${recalled ? 'YES' : 'NO'}`,
        );
      }
    }

    // 3. All 22 turns persisted: 44 rows, roles strictly alternating.
    let rows = listTurns(session.id);
    assert(rows.length === 44, `expected 44 rows after 22 turns, got ${rows.length}`);
    const roles = rows.map((r) => r.role).join(',');
    assert(
      roles === Array.from({ length: 22 }, () => 'user,assistant').join(','),
      'roles strictly alternate user,assistant',
    );

    // 4. Inspection turn — the context-length proof. prepareTurn persists the
    //    turn and returns the exact request the model receives; assert it stays
    //    capped at 12 messages no matter how long the history grew.
    const probe = 'What was the very last thing I said to you, Senior?';
    const handle = prepareTurn({ sessionId: session.id, content: probe });
    assert(
      handle.request.messages.length === 12,
      `context capped at 12 turns, got ${handle.request.messages.length}`,
    );
    const lastMsg = handle.request.messages[handle.request.messages.length - 1];
    assert(lastMsg.role === 'user' && lastMsg.content === probe, 'context ends on the current user turn');
    const contextChars =
      handle.request.system.length +
      handle.request.messages.reduce((n, m) => n + m.content.length, 0);
    assert(contextChars < 25_000, `context chars bounded (<25k), got ${contextChars}`);
    console.log(`  context at turn 23: ${handle.request.messages.length} messages, ${contextChars} chars`);

    const reply = await adapter.generate(handle.request);
    assert(reply.text.trim().length > 0, 'inspection reply non-empty');
    assert(isInCharacter(reply.text), `inspection reply in character: '${reply.text}'`);
    const stored = persistAssistantReply(session.id, reply.text);
    assert(stored.content === reply.text, 'inspection reply persisted');

    // 5. Coherence: the reply must track the immediately preceding user turn
    //    (#22) — the model is reading the conversation, not generating filler.
    const prev = SCRIPT[SCRIPT.length - 1];
    const overlap = [...contentWords(reply.text)].filter((w) => contentWords(prev).has(w));
    console.log(`  inspection reply → ${reply.text.replace(/\s+/g, ' ').slice(0, 140)}`);
    assert(
      overlap.length >= 1,
      `inspection reply tracks the last user turn (shared words: ${overlap.join(', ') || 'none'})`,
    );

    // 6. Final DB state: 46 rows (23 user + 23 assistant).
    rows = listTurns(session.id);
    assert(rows.length === 46, `expected 46 rows after 23 turns, got ${rows.length}`);

    console.log('SMOKE LONGCHAT PASSED');
  } finally {
    await adapter.dispose();
    await app.close();
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// Explicit exit: the adapter's opencode SSE connection keeps the event loop
// alive after main() finishes, so a script must exit itself or it hangs.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SMOKE LONGCHAT FAILED:', err);
    process.exit(1);
  });
