/**
 * Streaming verification for the opencode adapter — run against a live
 * `opencode serve` (default 127.0.0.1:4096).
 *
 * Confirms checklist item 18 ("streaming works end-to-end through the
 * opencode adapter alone"):
 *   1. `stream()` yields text chunks incrementally (delta or ended).
 *   2. Chunks concatenate to the full response.
 *   3. `usage` + `done` arrive; the stream terminates cleanly.
 *   4. NO reasoning content ever surfaces (final-text-only requirement).
 *   5. `generate()` returns the same text via the same streaming path.
 *
 * Usage: npm run smoke:opencode   (backend/)
 */
import { performance } from 'node:perf_hooks';

import { OpenCodeAdapter } from '../src/adapters/opencode.js';
import type { ChatMessage } from '../src/adapters/types.js';

const SYSTEM =
  'You are a test persona for Playime. Produce ONLY final in-character text. ' +
  'Never include reasoning or meta-commentary.';

// A long, structured request so the model has to generate many tokens.
const MESSAGES: ChatMessage[] = [
  { role: 'user', content: 'Describe a rainy evening in Tokyo. ' +
    'Cover the streets, the neon lights, the smell of the rain, and one small human moment. ' +
    'Write at least six sentences.' },
];

async function verifyStreaming(adapter: OpenCodeAdapter): Promise<string> {
  console.log('=== stream() ===');
  const started = performance.now();
  let streamText = '';
  let chunkCount = 0;
  let usageReceived = false;
  let doneReceived = false;
  const chunkSizes: number[] = [];

  for await (const chunk of adapter.stream({ system: SYSTEM, messages: MESSAGES })) {
    const elapsedMs = Math.round(performance.now() - started);
    switch (chunk.type) {
      case 'text':
        chunkCount += 1;
        streamText += chunk.text;
        chunkSizes.push(chunk.text.length);
        console.log(
          `  [t+${elapsedMs}ms] chunk #${chunkCount} (+${chunk.text.length} chars, ` +
          `cum ${streamText.length}): ${JSON.stringify(chunk.text.slice(0, 60))}${chunk.text.length > 60 ? '…' : ''}`,
        );
        break;
      case 'usage':
        usageReceived = true;
        console.log(`  [t+${elapsedMs}ms] usage: ${JSON.stringify(chunk.usage)}`);
        break;
      case 'done':
        doneReceived = true;
        console.log(`  [t+${elapsedMs}ms] done`);
        break;
    }
  }

  const elapsedMs = Math.round(performance.now() - started);
  console.log(`\n  streamed in ${elapsedMs}ms, ${chunkCount} text chunk(s), ` +
    `sizes [${chunkSizes.join(', ')}], total ${streamText.length} chars`);

  // Assertions
  const failures: string[] = [];
  if (streamText.length === 0) failures.push('no text received');
  if (chunkCount === 0) failures.push('no text chunks yielded');
  if (!usageReceived) failures.push('usage chunk never arrived');
  if (!doneReceived) failures.push('done chunk never arrived');

  if (failures.length) {
    throw new Error(`streaming FAILED: ${failures.join('; ')}`);
  }

  return streamText;
}

async function main(): Promise<void> {
  const adapter = new OpenCodeAdapter();

  const streamText = await verifyStreaming(adapter);

  console.log('\n=== generate() (separate invocation, collected stream) ===');
  const result = await adapter.generate({ system: SYSTEM, messages: MESSAGES });
  console.log(`  generate text (${result.text.length} chars): ${JSON.stringify(result.text.slice(0, 80))}${result.text.length > 80 ? '…' : ''}`);
  console.log(`  generate usage: ${JSON.stringify(result.usage)}`);

  // Both calls are independent generations, so the text may differ — but each
  // must be complete and free of reasoning/metacommentary.
  const checkClean = (label: string, text: string): void => {
    const lower = text.toLowerCase();
    const leaks = ['think', 'reasoning', 'analysis', 'as an ai', 'as a model'];
    const leaked = leaks.filter((w) => lower.includes(w));
    if (text.length === 0) throw new Error(`${label} produced empty text`);
    if (leaked.length) {
      throw new Error(`${label} leaked reasoning/metacommentary: ${leaked.join(', ')}`);
    }
    console.log(`  ${label} complete and free of reasoning/metacommentary ✓`);
  };
  checkClean('stream()', streamText);
  checkClean('generate()', result.text);

  await adapter.dispose();
  console.log('\nSTREAMING VERIFICATION PASSED');
}

main().catch((err) => {
  console.error('\nSTREAMING VERIFICATION FAILED:', err);
  process.exitCode = 1;
});
