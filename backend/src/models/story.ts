/**
 * StoryCard — the reusable story entity (Phase 4 foundation).
 *
 * A StoryCard is a composition of characters + world + scenarios.
 * It owns world/story context, character references, starting scenarios,
 * plot_flags, quest_log, and chapter_log.
 *
 * StoryCards reference Characters from the Character Pool rather than
 * duplicating them. The selected scenario becomes session state, not
 * story state.
 *
 * Quest log entries represent major plot waypoints — objectives with
 * completion conditions, not scripted scenes. The player improvises
 * how they get there.
 */
import { getDb } from '../db.js';
import { allocateId } from '../id.js';
import { ensureEntityDir } from '../storage.js';

// ── Types ──────────────────────────────────────────────────────────────

/** A quest/waypoint in the story's primary chain. */
export interface QuestEntry {
  id: string;
  title: string;
  objective: string;
  /** Position in the primary chain (0-based). */
  order: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  /** 'source' = literally in the source text; 'projected' = AI-extrapolated. */
  origin: 'source' | 'projected';
  /** True if this is the speculative ending waypoint. */
  is_ending?: boolean;
  /** Auto-update condition evaluated against plot_flags. */
  triggers_on?: { flag: string; op: 'eq' | 'gte' | 'lte'; value: unknown }[];
}

/** NPC within a story, with its own relationship state. */
export interface StoryNpc {
  id: string;
  name: string;
  description: string;
  relationship_state: { affection: number; trust: number; flags: string[] };
}

/** A reference to a Character Card from the Character Pool. */
export interface CharacterReference {
  character_id: string;
  role?: string;
  introduction?: string;
  relationship_to_user?: string;
  story_notes?: string;
}

/** Full story card shape — the single source of truth. */
export interface StoryCard {
  id: string;
  title: string;
  genre: string;
  premise: string;
  tone: string;
  description: string | null;
  cover_image: string | null;

  // World
  locations: string[];
  world_info: WorldInfoEntry[];

  // Cast
  cast_mode: 'fixed' | 'selectable' | 'open';
  character_references: CharacterReference[];
  npcs: StoryNpc[];

  // Quest chain (the primary plot waypoints)
  quest_log: QuestEntry[];

  // Starting scenarios (same concept as CharacterCard.starting_scenarios)
  starting_scenarios: StartingScenario[];

  // Stubs for fields the roadmap plans but this feature doesn't need yet
  plot_flags: Record<string, unknown>;
  current_scene: string | null;
  chapter_log: ChapterEntry[];

  // Card-browser metadata
  creator_name: string | null;
  tags: string[];
  stats: CardStats;

  // User preferences
  favorite: number;

  // Timestamps
  created_at: number;
  updated_at: number;
}

/** World info entry (shared with CharacterCard). */
export interface WorldInfoEntry {
  keys: string[];
  secondary_keys?: string[];
  selective?: boolean;
  selective_logic?: 'and' | 'or';
  constant?: boolean;
  content: string;
  insertion_order?: number;
  priority?: number;
  position?: 'before_char' | 'after_char';
  case_sensitive?: boolean;
  enabled?: boolean;
}

/** Starting scenario (same shape as CharacterCard's). */
export interface StartingScenario {
  id: string;
  name: string;
  description?: string;
  scenario: string;
  first_message: string;
}

/** Local-only engagement stats. */
export interface CardStats {
  replay_count: number;
  like_count: number;
  comment_count: number;
}

/** Chapter entry for the chapter log. */
export interface ChapterEntry {
  title: string;
  summary: string;
  checkpoint_id?: string;
}

// ── CRUD ───────────────────────────────────────────────────────────────

/** Parse a JSON column, returning a fallback on null/empty/malformed. */
function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Row shape as stored in SQLite (JSON columns are raw strings). */
interface StoryCardRow {
  id: string;
  title: string;
  genre: string;
  premise: string;
  tone: string;
  description: string | null;
  cover_image: string | null;
  locations: string;
  world_info: string;
  cast_mode: string;
  character_references: string;
  npcs: string;
  quest_log: string;
  starting_scenarios: string;
  plot_flags: string;
  current_scene: string | null;
  chapter_log: string;
  creator_name: string | null;
  tags: string;
  stats: string;
  favorite: number;
  created_at: number;
  updated_at: number;
}

/** Deserialize a DB row into a full `StoryCard`. */
function rowToStory(row: StoryCardRow): StoryCard {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    premise: row.premise,
    tone: row.tone,
    description: row.description,
    cover_image: row.cover_image,
    locations: parseJson<string[]>(row.locations, []),
    world_info: parseJson<WorldInfoEntry[]>(row.world_info, []),
    cast_mode: row.cast_mode as StoryCard['cast_mode'],
    character_references: parseJson<CharacterReference[]>(row.character_references, []),
    npcs: parseJson<StoryNpc[]>(row.npcs, []),
    quest_log: parseJson<QuestEntry[]>(row.quest_log, []),
    starting_scenarios: parseJson<StartingScenario[]>(row.starting_scenarios, []),
    plot_flags: parseJson<Record<string, unknown>>(row.plot_flags, {}),
    current_scene: row.current_scene,
    chapter_log: parseJson<ChapterEntry[]>(row.chapter_log, []),
    creator_name: row.creator_name,
    tags: parseJson<string[]>(row.tags, []),
    stats: parseJson<CardStats>(row.stats, {
      replay_count: 0,
      like_count: 0,
      comment_count: 0,
    }),
    favorite: row.favorite,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Columns returned by SELECT queries. */
const SELECT_COLS = [
  'id', 'title', 'genre', 'premise', 'tone', 'description', 'cover_image',
  'locations', 'world_info', 'cast_mode', 'character_references', 'npcs',
  'quest_log', 'starting_scenarios', 'plot_flags', 'current_scene',
  'chapter_log', 'creator_name', 'tags', 'stats', 'favorite',
  'created_at', 'updated_at',
].join(', ');

/** List all story cards, newest first. */
export function listStoryCards(): StoryCard[] {
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM story_card ORDER BY created_at DESC`)
    .all() as unknown as StoryCardRow[];
  return rows.map(rowToStory);
}

/** Get a single story card by id, or undefined. */
export function getStoryCard(id: string): StoryCard | undefined {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM story_card WHERE id = ?`)
    .get(id) as unknown as StoryCardRow | undefined;
  return row ? rowToStory(row) : undefined;
}

/** Input for creating a new story card. Only `title` is required. */
export interface CreateStoryCardInput {
  title: string;
  genre?: string | undefined;
  premise?: string | undefined;
  tone?: string | undefined;
  description?: string | null | undefined;
  cover_image?: string | null | undefined;
  locations?: string[] | undefined;
  world_info?: WorldInfoEntry[] | undefined;
  cast_mode?: StoryCard['cast_mode'] | undefined;
  character_references?: CharacterReference[] | undefined;
  npcs?: StoryNpc[] | undefined;
  quest_log?: QuestEntry[] | undefined;
  starting_scenarios?: StartingScenario[] | undefined;
  plot_flags?: Record<string, unknown> | undefined;
  current_scene?: string | null | undefined;
  chapter_log?: ChapterEntry[] | undefined;
  creator_name?: string | undefined;
  tags?: string[] | undefined;
  stats?: CardStats | undefined;
  favorite?: number | undefined;
}

/** Create a story card, returning the full row. */
export function createStoryCard(input: CreateStoryCardInput): StoryCard {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'story', input.title);

    db.prepare(
      `INSERT INTO story_card (
        id, title, genre, premise, tone, description, cover_image,
        locations, world_info, cast_mode, character_references, npcs,
        quest_log, starting_scenarios, plot_flags, current_scene,
        chapter_log, creator_name, tags, stats, favorite,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.title,
      input.genre ?? '',
      input.premise ?? '',
      input.tone ?? '',
      input.description ?? null,
      input.cover_image ?? null,
      JSON.stringify(input.locations ?? []),
      JSON.stringify(input.world_info ?? []),
      input.cast_mode ?? 'selectable',
      JSON.stringify(input.character_references ?? []),
      JSON.stringify(input.npcs ?? []),
      JSON.stringify(input.quest_log ?? []),
      JSON.stringify(input.starting_scenarios ?? []),
      JSON.stringify(input.plot_flags ?? {}),
      input.current_scene ?? null,
      JSON.stringify(input.chapter_log ?? []),
      input.creator_name ?? null,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.stats ?? { replay_count: 0, like_count: 0, comment_count: 0 }),
      input.favorite ?? 0,
      now,
      now,
    );

    db.exec('COMMIT');
    ensureEntityDir('stories', id);
    return getStoryCard(id)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Partial patch for updating a story card. All fields optional. */
export interface UpdateStoryCardInput {
  title?: string | undefined;
  genre?: string | undefined;
  premise?: string | undefined;
  tone?: string | undefined;
  description?: string | null | undefined;
  cover_image?: string | null | undefined;
  locations?: string[] | undefined;
  world_info?: WorldInfoEntry[] | undefined;
  cast_mode?: StoryCard['cast_mode'] | undefined;
  character_references?: CharacterReference[] | undefined;
  npcs?: StoryNpc[] | undefined;
  quest_log?: QuestEntry[] | undefined;
  starting_scenarios?: StartingScenario[] | undefined;
  plot_flags?: Record<string, unknown> | undefined;
  current_scene?: string | null | undefined;
  chapter_log?: ChapterEntry[] | undefined;
  creator_name?: string | null | undefined;
  tags?: string[] | undefined;
  stats?: CardStats | undefined;
  favorite?: number | undefined;
}

/** Columns whose JSON values need `JSON.stringify` when patching. */
const JSON_COLUMNS = new Set([
  'locations', 'world_info', 'character_references', 'npcs',
  'quest_log', 'starting_scenarios', 'plot_flags', 'chapter_log',
  'tags', 'stats',
]);

/**
 * Update a story card by id. Returns the updated card, or undefined
 * if the id doesn't exist. Only provided fields are written.
 */
export function updateStoryCard(
  id: string,
  patch: UpdateStoryCardInput,
): StoryCard | undefined {
  const existing = getStoryCard(id);
  if (!existing) return undefined;

  const db = getDb();
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    const column = key as keyof UpdateStoryCardInput;
    sets.push(`${column} = ?`);
    if (JSON_COLUMNS.has(column)) {
      values.push(JSON.stringify(val));
    } else {
      values.push(val as string | number | null);
    }
  }

  values.push(id);
  db.prepare(`UPDATE story_card SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getStoryCard(id);
}

/** Delete a story card by id. Returns true if a row was deleted. */
export function deleteStoryCard(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM story_card WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

/** Count sessions referencing a story card. */
export function countSessionsForStoryCard(storyId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS cnt FROM session WHERE story_card_id = ?')
    .get(storyId) as { cnt: number };
  return row.cnt;
}
