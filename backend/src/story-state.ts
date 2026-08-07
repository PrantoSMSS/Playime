/**
 * Story state extraction — Phase 4 runtime quest progression.
 *
 * After each AI turn, a cheap JSON-mode call checks the session's current
 * active quest's objective/triggers_on against the assistant's reply and
 * current plot_flags, then proposes state deltas.
 *
 * The extraction is fire-and-forget: errors are logged but don't block the
 * user's response. The model proposes deltas — it never directly edits state.
 */
import type { LmAdapter } from './adapters/index.js';
import type { QuestEntry } from './models/story.js';

// ── Types ──────────────────────────────────────────────────────────────

/** Raw result from the extraction LLM call. */
interface RawExtractionResult {
  /** Updated plot_flags based on this turn. */
  plot_flags: Record<string, unknown>;
  /** Whether the active quest was completed, failed, or unchanged. */
  quest_status: 'completed' | 'failed' | 'unchanged';
  /** Next quest id to activate (only when quest_status is completed or failed). */
  next_quest_id?: string | null;
  /** One sentence about a fact worth remembering, or "". */
  memory_note?: string;
}

/** The validated result returned to callers. */
export interface StoryStateResult {
  plot_flags: Record<string, unknown>;
  quest_status: 'completed' | 'failed' | 'unchanged';
  next_quest_id: string | null;
  memory_note: string;
}

// ── Extraction prompt ──────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You extract story state changes from a single narration turn.
Respond with ONLY a JSON object, no other text:
{"plot_flags": {}, "quest_status": "completed" | "failed" | "unchanged", "next_quest_id": null, "memory_note": ""}

Rules:
- plot_flags = updated flags based on what happened in this turn. Include ALL flags that should persist (not just changes). Keep flags as simple key-value pairs.
- quest_status = "completed" if the active quest's objective was clearly achieved, "failed" if the player made it impossible, "unchanged" otherwise.
- next_quest_id = the id of the next quest to activate (only when quest_status is "completed" or "failed"). null if no next quest.
- memory_note = one sentence noting a fact worth long-term memory, or "".
- Do NOT invent quest ids that don't exist. Only reference the current quest's id and the provided next quest id list.
- If unsure about quest completion, default to "unchanged".`;

// ── Core functions ─────────────────────────────────────────────────────

/**
 * Extract story state changes from the assistant's reply.
 *
 * @param adapter - The LM adapter for the extraction call.
 * @param assistantText - The assistant's latest in-character message.
 * @param activeQuest - The current active quest (if any).
 * @param plotFlags - The current plot flags.
 * @param nextQuestId - The id of the next quest in the chain (for validation).
 */
export async function extractStoryState(
  adapter: LmAdapter,
  assistantText: string,
  activeQuest: QuestEntry | undefined,
  plotFlags: Record<string, unknown>,
  nextQuestId?: string,
): Promise<StoryStateResult> {
  if (!activeQuest) {
    // No active quest — just extract plot flags from the turn
    return {
      plot_flags: plotFlags,
      quest_status: 'unchanged',
      next_quest_id: null,
      memory_note: '',
    };
  }

  const nextQuestHint = nextQuestId
    ? `The next quest in the chain has id "${nextQuestId}". If the current quest is completed or failed, set next_quest_id to this value.`
    : 'There is no next quest after the current one.';

  const result = await adapter.generate({
    system: `${EXTRACTION_SYSTEM}\n\nCurrent active quest: "${activeQuest.title}" (id: ${activeQuest.id})\nObjective: ${activeQuest.objective}\n${nextQuestHint}\nCurrent plot flags: ${JSON.stringify(plotFlags)}`,
    messages: [{ role: 'user', content: assistantText }],
  }, {
    temperature: 0.1,
    maxTokens: 500,
  });

  // Parse and validate the JSON result
  const parsed = extractJson(result.text);

  // Validate quest_status
  const validStatuses = ['completed', 'failed', 'unchanged'] as const;
  const questStatus = validStatuses.includes(parsed.quest_status as typeof validStatuses[number])
    ? (parsed.quest_status as StoryStateResult['quest_status'])
    : 'unchanged';

  return {
    plot_flags: typeof parsed.plot_flags === 'object' && parsed.plot_flags !== null
      ? parsed.plot_flags as Record<string, unknown>
      : plotFlags,
    quest_status: questStatus,
    next_quest_id: questStatus !== 'unchanged'
      ? (typeof parsed.next_quest_id === 'string' ? parsed.next_quest_id : null)
      : null,
    memory_note: typeof parsed.memory_note === 'string' ? parsed.memory_note : '',
  };
}

/**
 * Advance the quest chain based on the extraction result.
 * Pure function — no side effects, returns a new array.
 */
export function advanceQuest(
  questLog: QuestEntry[],
  result: StoryStateResult,
): QuestEntry[] {
  if (result.quest_status === 'unchanged') return questLog;

  const newStatus: QuestEntry['status'] = result.quest_status === 'completed'
    ? 'completed'
    : 'failed';

  return questLog.map((q) => {
    if (q.status === 'active') {
      // Mark the current quest as completed or failed
      return { ...q, status: newStatus };
    }
    if (result.next_quest_id && q.id === result.next_quest_id) {
      // Activate the next quest
      return { ...q, status: 'active' as const };
    }
    return q;
  });
}

/**
 * Evaluate triggers_on conditions against plot_flags.
 * Returns true if ALL conditions are met (AND logic), or if there are no conditions.
 */
export function evaluateTriggersOn(
  quest: QuestEntry,
  plotFlags: Record<string, unknown>,
): boolean {
  if (!quest.triggers_on || quest.triggers_on.length === 0) return true;

  return quest.triggers_on.every((condition) => {
    const flagValue = plotFlags[condition.flag];
    if (flagValue === undefined) return false;

    switch (condition.op) {
      case 'eq':
        return flagValue === condition.value;
      case 'gte':
        return typeof flagValue === 'number' && typeof condition.value === 'number'
          && flagValue >= condition.value;
      case 'lte':
        return typeof flagValue === 'number' && typeof condition.value === 'number'
          && flagValue <= condition.value;
      default:
        return false;
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Robustly extract JSON from LLM output. Handles:
 * - Raw JSON
 * - Markdown-fenced JSON (```json ... ```)
 * - Prose-wrapped JSON blocks
 */
function extractJson(text: string): Record<string, unknown> {
  // Try raw JSON first
  try {
    const trimmed = text.trim();
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch { /* not raw JSON, try other patterns */ }

  // Try markdown-fenced JSON
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim()) as unknown;
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch { /* continue */ }
  }

  // Try to find a JSON object in the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch { /* continue */ }
  }

  // Fallback: return empty state
  return { plot_flags: {}, quest_status: 'unchanged', next_quest_id: null, memory_note: '' };
}
