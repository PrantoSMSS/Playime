/**
 * Manual smoke test for the opencode adapter.
 *
 * Runs against a live `opencode serve` (default 127.0.0.1:4096). Exercises
 * both `stream()` (asserts only final text deltas arrive — no reasoning)
 * and `generate()` (non-streaming, full text + usage).
 *
 * Usage: npm run smoke:opencode   (backend/)
 */
import { OpenCodeAdapter } from '../src/adapters/opencode.js';
import type { ChatMessage } from '../src/adapters/types.js';

const SYSTEM =
  'You are a test persona for Playime. Produce ONLY final in-character text. ' +
  'Never include reasoning or meta-commentary.';
const MESSAGES: ChatMessage[] = [
  { role: 'user', content: 'Hello! Who are you?' },
  { role: 'assistant', content: 'I am a test persona, ready to help you test Playime.' },
  { role: 'user', content: 'Reply with exactly: ADAPTER-STREAM-OK' },
];

async function main(): Promise<void> {
  const adapter = new OpenCodeAdapter();

  console.log('=== stream() ===');
  let streamText = '';
  for await (const chunk of adapter.stream({ system: SYSTEM, messages: MESSAGES })) {
    if (chunk.type === 'text') {
      streamText += chunk.text;
      process.stdout.write(chunk.text);
    } else if (chunk.type === 'usage') {
      console.log('\n[usage]', JSON.stringify(chunk.usage));
    } else if (chunk.type === 'done') {
      console.log('\n[done]');
    }
  }
  console.log('\nstream text:', JSON.stringify(streamText));

  console.log('\n=== generate() ===');
  const result = await adapter.generate({ system: SYSTEM, messages: MESSAGES });
  console.log('generate text:', JSON.stringify(result.text));
  console.log('generate usage:', JSON.stringify(result.usage));

  await adapter.dispose();
  console.log('\nSMOKE OK');
}

main().catch((err) => {
  console.error('\nSMOKE FAILED:', err);
  process.exitCode = 1;
});
