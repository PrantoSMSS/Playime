/**
 * Chat service — Phase 1 core loop (checklist item 2).
 *
 * sendMessage persists the user turn, assembles the full-history-in-context
 * request (docs/PLAYIME_PROMPT_SPEC.md §1 + §3: system prompt + last
 * WORKING_CONTEXT_TURNS visible turns), calls the adapter, and persists the
 * reply. Non-streaming for now — SSE lands in checklist item 6.
 */
import type { LmAdapter } from './adapters/index.js';
import type { ChatMessage, TokenUsage } from './adapters/types.js';
import {
  createSession,
  getSession,
  insertMessage,
  listTurns,
  nextMessageSeq,
} from './models/session.js';
import type { CreateSessionInput, MessageRow, SessionRow } from './models/session.js';
import { CHARACTER_SYSTEM_PROMPT } from './prompts/character.js';

/** Working-context size — the last N turns go in verbatim (§3). */
const WORKING_CONTEXT_TURNS = 12;

/** HTTP-facing error raised by the service; routes map it to a status. */
export class ChatError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
    this.code = code;
  }
}

export class SessionNotFoundError extends ChatError {
  constructor(sessionId: string) {
    super(404, 'session_not_found', `Session ${sessionId} not found`);
  }
}

export class InvalidMessageError extends ChatError {
  constructor(reason: string) {
    super(400, 'invalid_message', reason);
  }
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
  ooc?: boolean | undefined;
}

export interface SendMessageResult {
  /** The persisted assistant reply (what the UI renders). */
  message: MessageRow;
  usage?: TokenUsage;
  model?: string;
}

export { createSession };
export type { CreateSessionInput, SessionRow } from './models/session.js';

/**
 * Send a user message and produce the assistant reply.
 *
 * Flow: persist user turn → load visible history → assemble the request
 * (system prompt + last-N-turns working context) → adapter.generate() →
 * persist assistant reply. An OOC turn directs the model but is not
 * dialogue: it is dropped from the fiction sequence and emitted as a
 * separate system block after the character system prompt (§3).
 */
export async function sendMessage(
  adapter: LmAdapter,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const session = getSession(input.sessionId);
  if (!session) throw new SessionNotFoundError(input.sessionId);

  const content = input.content.trim();
  if (content.length === 0) {
    throw new InvalidMessageError('message content must be non-empty');
  }
  const ooc = input.ooc === true;

  // Persist the user turn first; it is the newest row in the session.
  const userMsg = insertMessage({
    session_id: session.id,
    seq: nextMessageSeq(session.id),
    role: 'user',
    content,
    visible: 1,
    ooc: ooc ? 1 : 0,
  });

  // Full visible history; the just-inserted turn is always the last row.
  const turns = listTurns(session.id);

  // An OOC turn is direction, not dialogue — exclude it from the fiction
  // sequence (§3).
  const fictionTurns = ooc ? turns.filter((t) => t.id !== userMsg.id) : turns;

  const context = fictionTurns.slice(-WORKING_CONTEXT_TURNS);
  const messages: ChatMessage[] = context.map((t) => ({ role: t.role, content: t.content }));

  if (ooc) {
    // Separate system block placed after the character system prompt (§3).
    messages.push({
      role: 'system',
      content: `(Out-of-character note for the character: ${content})`,
    });
  }

  const result = await adapter.generate({
    system: CHARACTER_SYSTEM_PROMPT,
    messages,
  });

  const reply = insertMessage({
    session_id: session.id,
    seq: nextMessageSeq(session.id),
    role: 'assistant',
    content: result.text,
    visible: 1,
    ooc: 0,
  });

  return {
    message: reply,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.model ? { model: result.model } : {}),
  };
}
