/**
 * Deterministic prompt assembly for the opencode adapter.
 *
 * opencode's `/api/session/{id}/prompt` takes a single free-form `text`
 * field (a "prompt message"), not a structured `system` + `messages`
 * array like OpenAI-compatible providers. So the assembled `GenerateRequest`
 * from the prompt assembler is folded into one plain-text prompt:
 *   - a `system` (or RAG-memory block) becomes a "System:" part,
 *   - a `user` message becomes a "User:" part (with OOC as a separate
 *     system part),
 *   - `assistant` messages become "Assistant:" parts.
 *
 * This keeps the same logical content as the provider-agnostic assembly in
 * docs/PLAYIME_PROMPT_SPEC.md §1 while matching opencode's shape. Only the
 * LAST system part is the actual system prompt; earlier system blocks
 * (e.g. OOC notes) render as distinct System sections so the model still
 * sees the full sequence.
 *
 * Every part is placed in a markdown code fence. The purpose is to keep the
 * role boundaries explicit and the user's text verbatim, so the model reads
 * it as labeled sections rather than inferring roles from free prose.
 */
import type { ChatMessage } from './adapters/types.js';

/** Fold an assembled request into the single text prompt opencode expects. */
export function renderOpencodePrompt(system: string, messages: ChatMessage[]): string {
  const parts: string[] = [`System:\n\n\`\`\`\n${system}\n\`\`\``];

  for (const m of messages) {
    if (m.role === 'system') {
      // e.g. an OOC note — render as a distinct System section, after any
      // preceding parts, so it reads as current instruction, not dialogue.
      parts.push(`System:\n\n\`\`\`\n${m.content}\n\`\`\``);
      continue;
    }
    const label = m.role === 'user' ? 'User' : 'Assistant';
    parts.push(`${label}:\n\n\`\`\`\n${m.content}\n\`\`\``);
  }

  return parts.join('\n\n');
}
