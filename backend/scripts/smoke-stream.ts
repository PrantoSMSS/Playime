/**
 * End-to-end smoke test for the SSE streaming chat route (checklist item 6).
 *
 * Boots a real Fastify server on an ephemeral port with a throwaway DB and
 * drives it with `fetch` + the browser's SSE-parsing approach against the
 * live opencode server (must be running on 127.0.0.1:4096 — see
 * docs/setup-opencode.md). Asserts:
 *   - the stream route returns text/event-stream
 *   - delta frames arrive (chunks as the model emits them)
 *   - concatenated delta text is a non-empty prefix of the done message
 *   - done carries the persisted user_message + message (matching DB rows)
 *   - an unknown session 404s with JSON (not SSE)
 *
 * Usage: npm run smoke:stream   (backend/)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB at a throwaway file BEFORE the chat service first opens it.
const dir = mkdtempSync(join(tmpdir(), 'playime-stream-'));
process.env.PLAYIME_DB_PATH = join(dir, 'test.db');

import Fastify from 'fastify';
import { chatRoutes } from '../src/routes/chat.js';
import { getDb } from '../src/db.js';
import { listTurns } from '../src/models/session.js';

interface SseEvent {
  event: string;
  data: unknown;
}

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

/** Parse one SSE frame (`event:`/`data:` lines). Mirrors the browser parser. */
function parseSseEvent(raw: string): SseEvent | null {
  let event = 'message';
  let data: string | undefined;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trimStart();
  }
  if (data === undefined) return null;
  return { event, data: JSON.parse(data) as unknown };
}

/** Read a fetch body as an SSE event stream. */
async function readSse(res: Response): Promise<SseEvent[]> {
  if (!res.body) throw new Error('stream response has no body');
  const events: SseEvent[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseSseEvent(raw);
      if (parsed) events.push(parsed);
    }
  }
  return events;
}

async function main(): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(chatRoutes);
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Create a session.
    const created = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class: 'character' }),
    });
    assert(created.status === 201, `session create status ${created.status}`);
    const session = (await created.json()) as { id: string };
    assert(typeof session.id === 'string', 'session create body');

    // 2. Stream a message; collect SSE frames.
    const res = await fetch(`${base}/api/sessions/${session.id}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: "Hi! What's your name?" }),
    });
    assert(res.status === 200, `stream status ${res.status}`);
    assert(
      (res.headers.get('content-type') ?? '').startsWith('text/event-stream'),
      'content-type is text/event-stream',
    );
    const events = await readSse(res);

    const deltas = events
      .filter((e) => e.event === 'delta')
      .map((e) => (e.data as { text: string }).text);
    const done = events.find((e) => e.event === 'done');
    assert(done !== undefined, 'done event received');
    const doneData = done.data as {
      user_message: { role: string; content: string };
      message: { content: string };
    };
    const replyText = doneData.message.content;
    assert(replyText.trim().length > 0, 'done message non-empty');
    assert(
      doneData.user_message.role === 'user' &&
        doneData.user_message.content === "Hi! What's your name?",
      'done user_message echoes the sent turn',
    );
    const joined = deltas.join('');
    assert(joined.length > 0, 'at least one delta frame');
    assert(replyText.startsWith(joined), 'deltas concatenate to a prefix of the reply');
    const errorFrame = events.find((e) => e.event === 'error');
    assert(errorFrame === undefined, `unexpected error frame: ${JSON.stringify(errorFrame)}`);
    console.log(`  deltas: ${deltas.length} chunk(s), ${joined.length} chars`);
    console.log(`  reply: ${JSON.stringify(replyText.slice(0, 120))}`);

    // 3. The reply is persisted (user + assistant rows).
    const turns = listTurns(session.id);
    assert(turns.length === 2, `expected 2 turns, got ${turns.length}`);
    assert(turns[1]?.content === replyText, 'assistant row matches done message');

    // 4. Unknown session → JSON 404, not SSE.
    const missing = await fetch(`${base}/api/sessions/does-not-exist/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hi' }),
    });
    assert(missing.status === 404, `unknown session → 404, got ${missing.status}`);
    assert(
      (missing.headers.get('content-type') ?? '').startsWith('application/json'),
      '404 body is JSON',
    );

    console.log('SMOKE STREAM PASSED');
  } finally {
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
    console.error('SMOKE STREAM FAILED:', err);
    process.exit(1);
  });
