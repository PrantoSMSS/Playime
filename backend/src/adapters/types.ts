/**
 * Shared types for LM provider adapters.
 *
 * The adapter layer is the ONLY place a provider's SDK or HTTP API is
 * touched (see CLAUDE.md). Business logic depends on `LmAdapter` (defined
 * in index.ts) and on these types, never on a provider directly.
 *
 * Prompt assembly rules live in docs/PLAYIME_PROMPT_SPEC.md. An adapter
 * receives an already-assembled system prompt + working-context messages
 * and returns the assistant's final text (or its token deltas).
 */

/** Roles accepted in the `messages` sequence. */
export type ChatRole = 'user' | 'assistant' | 'system';

/** One message in the working context. `content` is final rendered text. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Everything a generation call needs.
 *
 * `system` is the fully assembled Character or Story system prompt;
 * `messages` are the recent turns (oldest → newest, ending on the current
 * user turn). Both come straight from the prompt assembler — an adapter
 * never assembles prompts itself.
 */
export interface GenerateRequest {
  system: string;
  messages: ChatMessage[];
}

/** Optional per-call tuning. All fields optional; adapters apply sane defaults. */
export interface GenerateOptions {
  /** Override the configured model for this call (e.g. small model for bookkeeping). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Cancellation handle — callers may abort mid-request or mid-stream. */
  signal?: AbortSignal;
}

/** Token accounting, normalized across providers (unit: tokens). */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning?: number;
}

/** Full non-streaming result. `text` is ALWAYS final assistant text only. */
export interface GenerateResult {
  text: string;
  usage?: TokenUsage;
  /** Resolved model id, if the provider reports one. */
  model?: string;
}

/**
 * A single item yielded by `LmAdapter.stream`.
 *
 * - `text` chunks are final-response text deltas; concatenating them in
 *   order reproduces the assistant's reply. Reasoning and bookkeeping
 *   never appear (see decisions log / PLAYIME_PROMPT_SPEC.md §0.3).
 * - `usage` is emitted once, near the end, if the provider reports usage.
 * - `done` always terminates the stream.
 */
export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done' };

/**
 * Static configuration for constructing an adapter (from env or a config
 * file). Discriminated on `id`; fields are what each adapter needs to
 * open its connection. Holds no runtime state.
 */
export type OpenCodeAdapterConfig = {
  id: 'opencode';
  /** e.g. `http://127.0.0.1:4096` */
  baseUrl?: string;
  /** `OPENCODE_SERVER_PASSWORD`, if the server requires one. */
  serverPassword?: string;
  defaultModel?: string;
  /** Cheap model for bookkeeping calls (summarize / state extraction). */
  smallModel?: string;
};

export type AdapterConfig =
  | OpenCodeAdapterConfig
  | {
      id: 'openai-compatible';
      /** Base URL of an OpenAI-compatible `/v1` endpoint (Ollama, LM Studio, vLLM). */
      baseUrl: string;
      apiKey?: string;
      defaultModel: string;
      smallModel?: string;
    }
  | {
      id: 'ollama';
      baseUrl?: string;
      defaultModel?: string;
      smallModel?: string;
    };

/** Machine-readable failure categories shared by every adapter. */
export type LmErrorCode =
  | 'config'
  | 'provider'
  | 'timeout'
  | 'cancelled'
  | 'context'
  | 'not-implemented';

/** Adapter error surfaced to business logic with a stable `code`. */
export class LmError extends Error {
  readonly code: LmErrorCode;

  constructor(code: LmErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LmError';
    this.code = code;
  }
}
