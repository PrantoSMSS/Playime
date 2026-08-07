/**
 * Story extraction pipeline — Phase 2.
 *
 * Takes raw source text and produces a draft StoryCard via three sequential
 * AI stages:
 *   1. Outline  — title, genre, tone, premise, locations, beats
 *   2. Cast     — named NPCs who matter to the plot
 *   3. Quests   — quest chain from beats + one AI-projected ending
 *
 * Uses the existing LmAdapter.generate() with strict-JSON prompts.
 * No new adapter needed — this is pure text extraction.
 *
 * "Propose, don't commit" — returns a draft; nothing hits the DB.
 */
import type { LmAdapter } from './adapters/index.js';
import type { QuestEntry, StoryNpc } from './models/story.js';

// ── Pipeline types ──────────────────────────────────────────────────────

export interface OutlineBeat {
  summary: string;
  order: number;
}

export interface OutlineLocation {
  name: string;
  description: string;
}

export interface OutlineResult {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  locations: OutlineLocation[];
  beats: OutlineBeat[];
}

export interface CastNpc {
  name: string;
  personality: string;
  speech_style: string;
  tagline: string;
}

export interface CastResult {
  npcs: CastNpc[];
}

/** The final draft returned by the extraction pipeline. */
export interface ExtractionDraft {
  title: string;
  genre: string;
  premise: string;
  tone: string;
  locations: string[];
  npcs: StoryNpc[];
  quest_log: QuestEntry[];
}

/** Stage progress event emitted during extraction. */
export type StageProgress =
  | { stage: 'outline'; status: 'started' | 'done' }
  | { stage: 'cast'; status: 'started' | 'done' }
  | { stage: 'quests'; status: 'started' | 'done' }
  | { stage: 'error'; status: 'failed'; message: string };

export type OnStageProgress = (event: StageProgress) => void;

// ── Chunking ────────────────────────────────────────────────────────────

/**
 * Approximate token budget for a single chunk.
 * ~4 chars per token is a rough English average; 12k tokens ≈ 48k chars.
 * This keeps each chunk safely under most model context windows while
 * leaving room for the system prompt + output.
 */
const CHUNK_CHAR_BUDGET = 48_000;

/** Overlap between consecutive chunks so beats spanning boundaries aren't lost. */
const CHUNK_OVERLAP_CHARS = 2_000;

/**
 * Split source text into sequential segments for map-reduce processing.
 * Returns a single chunk if the text fits within the budget.
 */
export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_CHAR_BUDGET) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHAR_BUDGET, text.length);
    chunks.push(text.slice(start, end));
    // Advance by budget minus overlap so consecutive chunks share context
    start = end - CHUNK_OVERLAP_CHARS;
  }

  return chunks;
}

// ── JSON extraction helper ──────────────────────────────────────────────

/**
 * Extract a JSON object from LLM output text.
 * Handles cases where the model wraps JSON in ```json fences or adds prose.
 */
function extractJson<T>(text: string): T {
  // Try direct parse first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Not raw JSON — try extracting from markdown fences
  }

  // Look for ```json ... ``` blocks
  const fenceMatch = trimmed.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Fall through
    }
  }

  // Last resort: find the first { ... } or [ ... ] block
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      // Fall through
    }
  }

  throw new Error(
    `Failed to extract JSON from LLM output. First 200 chars: ${trimmed.slice(0, 200)}`,
  );
}

// ── Stage 1: Outline ────────────────────────────────────────────────────

const OUTLINE_SYSTEM = `You are a story analysis expert. Given a piece of fiction text, extract a structured outline.

Respond with ONLY a JSON object matching this exact shape (no prose, no explanation):

{
  "title": "A short, evocative title for the story",
  "genre": "Primary genre (e.g. Fantasy, Sci-Fi, Romance, Horror, Mystery, Slice of Life)",
  "tone": "The overall tone (e.g. Dark and brooding, Whimsical, Intense, Melancholic)",
  "premise": "A 1-3 sentence summary of the story's core premise",
  "locations": [
    { "name": "Location name", "description": "Brief description of the location and its significance" }
  ],
  "beats": [
    { "summary": "A concise description of this major plot turn", "order": 0 }
  ]
}

Rules:
- "beats" are the major turns/events in the plot, in chronological order. Each beat is a significant story moment, not a scene-level detail.
- "locations" are the distinct settings/places that appear in the story.
- "title" should be creative and capture the essence of the story.
- Keep beat summaries concise (1-2 sentences each).
- The beat "order" field is the 0-based index in the beats array.
- Return at least 3 beats for short stories, 5+ for longer ones.`;

async function runOutlineStage(
  adapter: LmAdapter,
  sourceText: string,
): Promise<OutlineResult> {
  const messages = [
    {
      role: 'user' as const,
      content: `Analyze the following story text and extract its outline.\n\n---\n\n${sourceText}`,
    },
  ];

  const result = await adapter.generate(
    { system: OUTLINE_SYSTEM, messages },
    { temperature: 0.3, maxTokens: 2000 },
  );

  return extractJson<OutlineResult>(result.text);
}

// ── Stage 2: Cast ───────────────────────────────────────────────────────

const CAST_SYSTEM = `You are a story analysis expert. Given a story outline and source text, identify the named characters who matter to the plot.

Respond with ONLY a JSON object matching this exact shape (no prose, no explanation):

{
  "npcs": [
    {
      "name": "Character name",
      "personality": "Key personality traits (2-3 sentences)",
      "speech_style": "How they talk (formal, casual, poetic, etc.)",
      "tagline": "A short memorable phrase that captures who they are"
    }
  ]
}

Rules:
- Include characters who appear in more than one beat, or are explicitly named as significant.
- Do NOT include background characters who appear only once.
- Do NOT include the protagonist/player character.
- Keep descriptions concise but evocative.
- Return an empty array if no NPCs are identified (unlikely for fiction).`;

async function runCastStage(
  adapter: LmAdapter,
  outline: OutlineResult,
  sourceText: string,
): Promise<CastResult> {
  const outlineJson = JSON.stringify(outline, null, 2);
  const messages = [
    {
      role: 'user' as const,
      content: `Here is the story outline:\n\n${outlineJson}\n\n---\n\nHere is the source text:\n\n${sourceText.slice(0, 20_000)}\n\nIdentify the key named characters (NPCs) in this story.`,
    },
  ];

  const result = await adapter.generate(
    { system: CAST_SYSTEM, messages },
    { temperature: 0.3, maxTokens: 1500 },
  );

  return extractJson<CastResult>(result.text);
}

// ── Stage 3: Quest chain ────────────────────────────────────────────────

const QUEST_SYSTEM = `You are a story structure expert. Given a story outline and its cast, create a quest chain — a sequence of major plot waypoints.

Respond with ONLY a JSON object matching this exact shape (no prose, no explanation):

{
  "quest_log": [
    {
      "id": "unique_lowercase_id",
      "title": "Short quest title",
      "objective": "What the player/protagonist needs to achieve (1-2 sentences)",
      "order": 0,
      "status": "pending",
      "origin": "source",
      "is_ending": false,
      "triggers_on": []
    }
  ]
}

Rules:
- Each beat from the outline becomes one quest entry with "origin": "source".
- The "id" should be a short, unique, lowercase slug (e.g. "find_the_key", "confront_villain").
- "order" is the 0-based position in the chain.
- "status" for the first quest should be "active", all others "pending".
- "triggers_on" should contain a best-guess condition based on the beat description. Example: [{"flag": "has_key", "op": "eq", "value": true}]. Use empty array [] if no clear trigger can be inferred.
- AFTER all source quests, ALWAYS append ONE additional quest with "origin": "projected", "is_ending": true, "status": "pending". This is the speculative ending — the most plausible resolution given the story so far. Frame it as a proposal, not certainty.
- The projected ending should feel like a natural conclusion to the quest chain.
- Return at least 3 source quests for short stories, 5+ for longer ones.`;

async function runQuestStage(
  adapter: LmAdapter,
  outline: OutlineResult,
  cast: CastResult,
): Promise<QuestEntry[]> {
  const contextJson = JSON.stringify({ outline, cast }, null, 2);
  const messages = [
    {
      role: 'user' as const,
      content: `Given this story context, create the quest chain.\n\n${contextJson}`,
    },
  ];

  const result = await adapter.generate(
    { system: QUEST_SYSTEM, messages },
    { temperature: 0.3, maxTokens: 2000 },
  );

  const parsed = extractJson<{ quest_log: QuestEntry[] }>(result.text);
  return parsed.quest_log;
}

// ── Main orchestrator ───────────────────────────────────────────────────

/**
 * Run the full 3-stage extraction pipeline.
 *
 * If source text exceeds the chunk budget, Stage 1 runs on chunk summaries
 * (map-reduce) while Stages 2+3 run on the full outline + a truncated
 * source excerpt.
 *
 * @param adapter   The LM adapter to use for all stages.
 * @param text      The full source text to analyze.
 * @param onProgress  Optional callback for stage progress events.
 * @returns         The assembled draft (not persisted).
 */
export async function extractStoryDraft(
  adapter: LmAdapter,
  text: string,
  onProgress?: OnStageProgress,
): Promise<ExtractionDraft> {
  const emit = (event: StageProgress) => onProgress?.(event);

  // ── Chunking: map-reduce for Stage 1 if text is long ──────────────
  const chunks = chunkText(text);
  let outline: OutlineResult;

  emit({ stage: 'outline', status: 'started' });

  try {
    if (chunks.length === 1) {
      // Short text — single pass
      outline = await runOutlineStage(adapter, chunks[0]!);
    } else {
      // Long text — summarize each chunk, then outline the summaries
      const summaries: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkSummary = await runOutlineStage(adapter, chunks[i]!);
        summaries.push(
          `--- Segment ${i + 1}/${chunks.length} ---\n` +
          `Title: ${chunkSummary.title}\n` +
          `Premise: ${chunkSummary.premise}\n` +
          `Beats:\n${chunkSummary.beats.map((b) => `  ${b.order}: ${b.summary}`).join('\n')}`,
        );
      }
      // Combine summaries into a single outline pass
      outline = await runOutlineStage(adapter, summaries.join('\n\n'));
    }
    emit({ stage: 'outline', status: 'done' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ stage: 'error', status: 'failed', message: `Outline stage failed: ${msg}` });
    throw err;
  }

  // ── Stage 2: Cast ───────────────────────────────────────────────
  emit({ stage: 'cast', status: 'started' });

  let cast: CastResult;
  try {
    cast = await runCastStage(adapter, outline, text);
    emit({ stage: 'cast', status: 'done' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ stage: 'error', status: 'failed', message: `Cast stage failed: ${msg}` });
    throw err;
  }

  // ── Stage 3: Quest chain ───────────────────────────────────────
  emit({ stage: 'quests', status: 'started' });

  let questLog: QuestEntry[];
  try {
    questLog = await runQuestStage(adapter, outline, cast);
    emit({ stage: 'quests', status: 'done' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ stage: 'error', status: 'failed', message: `Quest stage failed: ${msg}` });
    throw err;
  }

  // ── Assemble the draft ─────────────────────────────────────────
  return {
    title: outline.title,
    genre: outline.genre,
    premise: outline.premise,
    tone: outline.tone,
    locations: outline.locations.map((l) => l.name),
    npcs: cast.npcs.map((npc, i) => ({
      id: `npc_extracted_${i}`,
      name: npc.name,
      description: `${npc.personality} ${npc.tagline}`,
      relationship_state: { affection: 0, trust: 0, flags: [] },
    })),
    quest_log: questLog,
  };
}

// ── Single quest regeneration ───────────────────────────────────────────

const REGENERATE_QUEST_SYSTEM = `You are a story structure expert. Given the context of a story and an existing quest chain, regenerate a single quest entry.

Respond with ONLY a JSON object matching this exact shape (no prose, no explanation):

{
  "id": "unique_lowercase_id",
  "title": "Short quest title",
  "objective": "What the player/protagonist needs to achieve (1-2 sentences)",
  "order": 0,
  "status": "pending",
  "origin": "source",
  "is_ending": false,
  "triggers_on": []
}

Rules:
- The regenerated quest should fit naturally in the chain at the given order position.
- Keep the same "id" as the original quest being replaced.
- Maintain "origin" and "is_ending" from the original unless regeneration changes their nature.
- The quest should be consistent with surrounding quests in the chain.`;

/**
 * Regenerate a single quest entry given existing context.
 *
 * @param adapter   The LM adapter to use.
 * @param questId   The id of the quest to regenerate.
 * @param existingQuests  The full quest chain for context.
 * @param outline   The story outline for context.
 * @param cast      The story cast for context.
 * @returns         The regenerated quest entry.
 */
export async function regenerateQuest(
  adapter: LmAdapter,
  questId: string,
  existingQuests: QuestEntry[],
  outline: OutlineResult,
  cast: CastResult,
): Promise<QuestEntry> {
  const targetQuest = existingQuests.find((q) => q.id === questId);
  if (!targetQuest) {
    throw new Error(`Quest ${questId} not found in quest chain`);
  }

  const contextJson = JSON.stringify({
    outline: { title: outline.title, genre: outline.genre, premise: outline.premise },
    cast: { npcs: cast.npcs.map((n) => n.name) },
    quest_chain: existingQuests.map((q) => ({
      id: q.id,
      title: q.title,
      objective: q.objective,
      order: q.order,
      origin: q.origin,
    })),
    regenerate: { id: targetQuest.id, title: targetQuest.title, objective: targetQuest.objective },
  }, null, 2);

  const messages = [
    {
      role: 'user' as const,
      content: `Regenerate the quest with id "${questId}" in this chain.\n\n${contextJson}`,
    },
  ];

  const result = await adapter.generate(
    { system: REGENERATE_QUEST_SYSTEM, messages },
    { temperature: 0.5, maxTokens: 500 },
  );

  const regenerated = extractJson<QuestEntry>(result.text);
  // Preserve chain position and metadata from the original
  regenerated.order = targetQuest.order;
  regenerated.origin = targetQuest.origin;
  if (targetQuest.is_ending) regenerated.is_ending = true;
  regenerated.status = 'pending';

  return regenerated;
}
