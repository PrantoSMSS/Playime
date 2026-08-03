/**
 * Chat service — Phase 1 core loop (checklist item 2).
 *
 * sendMessage persists the user turn, assembles the full-history-in-context
 * request (docs/PLAYIME_PROMPT_SPEC.md §1 + §3: system prompt + last
 * WORKING_CONTEXT_TURNS visible turns), calls the adapter, and persists the
 * reply. Non-streaming for now — SSE lands in checklist item 6.
 */
import type { LmAdapter } from './adapters/index.js';
import type { ChatMessage, GenerateRequest, TokenUsage } from './adapters/types.js';
import {
  createSession,
  getSession,
  insertMessage,
  listTurns,
  nextMessageSeq,
} from './models/session.js';
import type { CreateSessionInput, MessageRow, SessionRow } from './models/session.js';
import { getCharacterCard, YEHWA_CARD } from './models/character.js';
import { renderCharacterSystemPrompt } from './prompts/character.js';

/** Working-context size — the last N turns go in verbatim (§3). */
const WORKING_CONTEXT_TURNS = 12;

/**
 * An OOC/stage-direction note is a message whose trimmed text is wrapped in
 * asterisks (`*you bow politely*`). This plain-text convention auto-sets the
 * same `ooc` flag that the Phase 5 OOC toggle sets explicitly.
 */
function isOocWrapped(text: string): boolean {
  return (
    text.length > 2 &&
    text.startsWith('*') &&
    text.endsWith('*') &&
    !text.slice(1, -1).includes('*')
  );
}

/** Strip the surrounding asterisks from an OOC note (`*…*` → `…`). */
function unwrapOoc(text: string): string {
  return text.slice(1, -1).trim();
}

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
  /**
   * The message text. Wrapping it in asterisks (`*you bow politely*`) marks it
   * as an OOC/stage-direction note — same effect as `ooc: true`.
   */
  content: string;
  /** Explicit OOC flag (Phase 5 toggle). Redundant with asterisk wrapping. */
  ooc?: boolean | undefined;
}

export interface SendMessageResult {
  /** The persisted user turn — lets the UI render exactly what was stored. */
  user_message: MessageRow;
  /** The persisted assistant reply (what the UI renders). */
  message: MessageRow;
  usage?: TokenUsage;
  model?: string;
}

export { createSession };
export type { CreateSessionInput, SessionRow } from './models/session.js';

/**
 * The system prompt for a session, by class. Phase 1 supports Character only
 * (hardcoded test card — checklist item 3); Story lands in Phase 4, where its
 * WorldCard renderer slots in here.
 *
 * If the session has a character_card_id, load the card from the database.
 * If the session has a starting_scenario_snapshot, use its scenario text.
 */
function systemPromptFor(session: SessionRow): string {
  if (session.class === 'story') {
    throw new ChatError(
      501,
      'story_not_implemented',
      'Story sessions are not supported yet (Phase 4)',
    );
  }

  // Use the card from the database if linked, otherwise fall back to the test card
  const card = session.character_card_id
    ? getCharacterCard(session.character_card_id)
    : undefined;
  const effectiveCard = card ?? YEHWA_CARD;

  // Use the snapshot's scenario if available, otherwise the card's default
  const startingScenario = session.starting_scenario_snapshot ?? undefined;

  return renderCharacterSystemPrompt(effectiveCard, effectiveCard.relationship_state, startingScenario);
}

export interface StreamMessageHandle {
  /** Persisted user turn — inserted before the adapter call. */
  userMessage: MessageRow;
  /** Fully assembled request for the adapter (system + working context). */
  request: GenerateRequest;
}

/**
 * Validate, persist the user turn, and assemble the adapter request. Shared
 * by the non-streaming `sendMessage` and the SSE stream route so both paths
 * build identical context (docs/PLAYIME_PROMPT_SPEC.md §1 + §3).
 *
 * An OOC turn directs the model but is not dialogue: it is dropped from the
 * fiction sequence and emitted as a separate system block after the
 * character system prompt (§3).
 */
export function prepareTurn(input: SendMessageInput): StreamMessageHandle {
  const session = getSession(input.sessionId);
  if (!session) throw new SessionNotFoundError(input.sessionId);

  const content = input.content.trim();
  if (content.length === 0) {
    throw new InvalidMessageError('message content must be non-empty');
  }
  // Explicit flag OR the asterisk stage-direction convention (*…*).
  const ooc = input.ooc === true || isOocWrapped(content);
  const note = ooc ? unwrapOoc(content) : content;

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
    // The note is the stripped text — the surrounding asterisks are a UI
    // convention, not part of the direction.
    messages.push({
      role: 'system',
      content: `(Out-of-character note for the character: ${note})`,
    });
  }

  return { userMessage: userMsg, request: { system: systemPromptFor(session), messages } };
}

/** Persist the assistant reply row (a single insert after the reply completes). */
export function persistAssistantReply(sessionId: string, text: string): MessageRow {
  return insertMessage({
    session_id: sessionId,
    seq: nextMessageSeq(sessionId),
    role: 'assistant',
    content: text,
    visible: 1,
    ooc: 0,
  });
}

/**
 * Send a user message and produce the assistant reply (non-streaming).
 *
 * Flow: `prepareTurn` (persist user turn → assemble request) →
 * adapter.generate() → persist assistant reply.
 */
export async function sendMessage(
  adapter: LmAdapter,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const { userMessage, request } = prepareTurn(input);
  const result = await adapter.generate(request);
  const reply = persistAssistantReply(input.sessionId, result.text);

  return {
    user_message: userMessage,
    message: reply,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.model ? { model: result.model } : {}),
  };
}
