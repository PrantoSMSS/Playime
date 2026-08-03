/**
 * The single LM adapter interface.
 *
 * Every provider (opencode, Ollama, LM Studio, vLLM, ...) implements
 * exactly this contract. Business/route code depends only on `LmAdapter`;
 * it never sees a provider SDK (CLAUDE.md "Core architectural rule").
 *
 * Correspondence with the Phase 0 checklist's `generate(messages, system,
 * stream) -> tokens`:
 *   - `stream(request, opts)`            == stream = true  → token deltas
 *   - `generate(request, opts)`          == stream = false → full `text`
 *   - `request.system` + `request.messages` == the `system` + `messages` args
 *
 * Guarantees every adapter must uphold:
 *   1. FINAL TEXT ONLY — output is the assistant's response text. No
 *      reasoning, planning, or bookkeeping is ever returned, even when the
 *      upstream stream carries it (e.g. opencode's `session.next.reasoning.*`
 *      events are dropped). See decisions log.
 *   2. PROMPT-AGNOSTIC — adapters never assemble prompts; they receive an
 *      already-assembled `GenerateRequest`. Assembly lives in the prompt
 *      assembler per docs/PLAYIME_PROMPT_SPEC.md.
 *   3. STREAMING-NATIVE — `stream()` yields final-text deltas as they
 *      arrive; `generate()` may internally collect a stream. This matches
 *      opencode, where the /prompt call is fire-and-confirm and the reply
 *      only exists on the /event stream.
 *   4. CANCELLABLE — honor `GenerateOptions.signal`.
 *   5. FAILURE-NORMALIZED — throw `LmError` with a stable `code`, never a
 *      raw provider error.
 */
import type {
  GenerateOptions,
  GenerateRequest,
  GenerateResult,
  StreamChunk,
} from './types.js';

export interface LmAdapter {
  /** Stable adapter id, e.g. `'opencode'` — used for config and diagnostics. */
  readonly id: string;

  /** One complete response; resolves when the reply is fully received. */
  generate(request: GenerateRequest, options?: GenerateOptions): Promise<GenerateResult>;

  /** Token-by-token text deltas of the response. */
  stream(request: GenerateRequest, options?: GenerateOptions): AsyncIterable<StreamChunk>;
}

export type { AdapterConfig, ChatMessage, ChatRole, GenerateOptions, GenerateRequest, GenerateResult, LmErrorCode, StreamChunk, TokenUsage } from './types.js';
export { LmError } from './types.js';
