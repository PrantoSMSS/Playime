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
  updateSession,
} from './models/session.js';
import type { CreateSessionInput, MessageRow, SessionRow } from './models/session.js';
import { getCharacterCard, YEHWA_CARD } from './models/character.js';
import { getStoryCard } from './models/story.js';
import type { QuestEntry, ChapterEntry } from './models/story.js';
import { renderCharacterSystemPrompt } from './prompts/character.js';
import { renderStorySystemPrompt } from './prompts/story.js';
import { extractStoryState, advanceQuest, summarizeChapter } from './story-state.js';

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
    // Load the story card for this session
    const story = session.story_card_id
      ? getStoryCard(session.story_card_id)
      : undefined;
    if (!story) {
      throw new ChatError(
        500,
        'story_not_found',
        `Story card ${session.story_card_id ?? '(none)'} not found for session`,
      );
    }

    // Parse per-session quest log state (falls back to card template)
    let questLogState: QuestEntry[] | undefined;
    if (session.quest_log_state) {
      try {
        questLogState = JSON.parse(session.quest_log_state) as QuestEntry[];
      } catch { /* fall back to card's quest_log */ }
    }

    // Parse per-session plot flags (falls back to card template)
    let plotFlags: Record<string, unknown> | undefined;
    if (session.plot_flags && session.plot_flags !== '{}') {
      try {
        plotFlags = JSON.parse(session.plot_flags) as Record<string, unknown>;
      } catch { /* fall back to card's plot_flags */ }
    }

    const persona = session.persona_snapshot ?? undefined;
    return renderStorySystemPrompt(story, questLogState, plotFlags, persona);
  }

  // Use the card from the database if linked, otherwise fall back to the test card
  const card = session.character_card_id
    ? getCharacterCard(session.character_card_id)
    : undefined;
  const effectiveCard = card ?? YEHWA_CARD;

  // Use the snapshot's scenario if available, otherwise the card's default
  const startingScenario = session.starting_scenario_snapshot ?? undefined;

  // Use the persona snapshot if available (user identity, not character avatar)
  const persona = session.persona_snapshot ?? undefined;

  return renderCharacterSystemPrompt(effectiveCard, effectiveCard.relationship_state, startingScenario, persona);
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
 * Post-turn story state extraction — fire-and-forget.
 *
 * After the assistant's reply is persisted, this runs a small-model call to
 * extract plot_flags updates and quest status changes. Errors are logged
 * but never affect the user's response (they already have their reply).
 *
 * Only runs for story sessions with an active quest.
 */
export async function extractStoryStateAfterTurn(
  adapter: LmAdapter,
  sessionId: string,
  assistantText: string,
): Promise<void> {
  try {
    const session = getSession(sessionId);
    if (!session || session.class !== 'story') return;

    // Parse current state
    let questLog: QuestEntry[] = [];
    let plotFlags: Record<string, unknown> = {};

    if (session.quest_log_state) {
      try { questLog = JSON.parse(session.quest_log_state) as QuestEntry[]; } catch { /* empty */ }
    }
    if (session.plot_flags && session.plot_flags !== '{}') {
      try { plotFlags = JSON.parse(session.plot_flags) as Record<string, unknown>; } catch { /* empty */ }
    }

    // Find the active quest
    const activeQuest = questLog.find((q) => q.status === 'active');
    if (!activeQuest && Object.keys(plotFlags).length === 0) return; // nothing to extract

    // Find the next quest in chain (for validation)
    const sortedQuests = [...questLog].sort((a, b) => a.order - b.order);
    const activeIdx = sortedQuests.findIndex((q) => q.id === activeQuest?.id);
    const nextQuest = activeIdx >= 0 && activeIdx < sortedQuests.length - 1
      ? sortedQuests[activeIdx + 1]
      : undefined;

    const result = await extractStoryState(
      adapter,
      assistantText,
      activeQuest,
      plotFlags,
      nextQuest?.id,
    );

    // Apply results deterministically
    const newFlags = { ...plotFlags, ...result.plot_flags };
    const newQuestLog = advanceQuest(questLog, result);

    // Persist — updateSession handles JSON stringification for both fields
    updateSession(sessionId, {
      plot_flags: JSON.stringify(newFlags),
      quest_log_state: JSON.stringify(newQuestLog),
    });

    // On quest completion/failure, summarize the chapter
    if (result.quest_status !== 'unchanged' && activeQuest) {
      try {
        // Get recent turns for summarization
        const turns = listTurns(sessionId);
        const recentTurns = turns
          .filter((t) => t.visible === 1 && (t.role === 'user' || t.role === 'assistant'))
          .slice(-20) // last 20 visible turns
          .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));

        if (recentTurns.length >= 2) {
          const chapter = await summarizeChapter(adapter, recentTurns, activeQuest.title);

          // Parse existing chapter_log, append new entry, persist
          let chapterLog: ChapterEntry[] = [];
          if (session.chapter_log) {
            try { chapterLog = JSON.parse(session.chapter_log) as ChapterEntry[]; } catch { /* empty */ }
          }
          chapterLog.push(chapter);
          updateSession(sessionId, {
            chapter_log: JSON.stringify(chapterLog),
          });
        }
      } catch (chapterErr) {
        // Chapter summarization errors are non-fatal
        console.error('[story-state] chapter summarization failed:', chapterErr);
      }
    }
  } catch (err) {
    // Extraction errors are non-fatal — log and move on
    console.error('[story-state] extraction failed:', err);
  }
}

/**
 * Send a user message and produce the assistant reply (non-streaming).
 *
 * Flow: `prepareTurn` (persist user turn → assemble request) →
 * adapter.generate() → persist assistant reply → post-turn extraction (story).
 */
export async function sendMessage(
  adapter: LmAdapter,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const { userMessage, request } = prepareTurn(input);
  const result = await adapter.generate(request);
  const reply = persistAssistantReply(input.sessionId, result.text);

  // Post-turn story state extraction (fire-and-forget, non-blocking)
  void extractStoryStateAfterTurn(adapter, input.sessionId, result.text);

  return {
    user_message: userMessage,
    message: reply,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.model ? { model: result.model } : {}),
  };
}
