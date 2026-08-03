/**
 * Character card — the persona data model (AGENTS.md "Data model quick
 * reference", PLAYIME_ROADMAP.md §3).
 *
 * Phase 2 foundation: full CharacterCard interface (core persona + Tavern
 * V2/V3 compatibility + card-browser metadata) backed by SQLite CRUD.
 * The `YEHWA_CARD` test fixture stays as the Phase 1 hardcoded persona.
 *
 * The running key-event timeline is per-session (`session_event` table),
 * never a card field (AGENTS.md "Memory system" layer 2).
 * `relationship_state` here is the card's starting state; per-session
 * evolution lands with Phase 2's structured extraction.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface RelationshipState {
  /** 0..100, moves only via Phase 2 structured extraction deltas. */
  affection: number;
  /** 0..100, moves only via Phase 2 structured extraction deltas. */
  trust: number;
  /** Relationship/plot flags, e.g. 'protector'. Empty when none. */
  flags: string[];
}

/**
 * World Info / lorebook entry — field-compatible with SillyTavern's
 * `character_book` entries (PLAYIME_ROADMAP.md §3, §4 layer 2.5).
 * Populated on card import; scanned deterministically each turn.
 */
export interface WorldInfoEntry {
  keys: string[];
  secondary_keys?: string[] | undefined;
  selective?: boolean | undefined;
  selective_logic?: 'AND' | 'NOT' | undefined;
  constant?: boolean | undefined;
  content: string;
  insertion_order: number;
  priority?: number | undefined;
  position?: 'before_char' | 'after_char' | undefined;
  case_sensitive?: boolean | undefined;
  enabled: boolean;
}

/** Local-only engagement stats shown in the card browser. */
export interface CardStats {
  replay_count: number;
  like_count: number;
  comment_count: number;
}

/** Full character card shape — the single source of truth. */
export interface CharacterCard {
  // Core persona
  id: string;
  name: string;
  avatar: string | null;
  tagline: string;
  personality: string;
  speech_style: string;
  likes_and_dislikes: string;
  scenario: string;
  first_message: string | null;
  relationship_state: RelationshipState;
  length_guidance: string | null;

  // Tavern V2/V3 compatibility
  alternate_greetings: string[];
  mes_example: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  creator: string | null;
  creator_notes: string | null;
  character_version: string | null;
  world_info: WorldInfoEntry[];
  extensions: Record<string, unknown>;

  // Card-browser metadata
  cover_image: string | null;
  creator_name: string | null;
  tags: string[];
  description: string | null;
  prologue_preview: string | null;
  stats: CardStats;
  created_at: number;
  updated_at: number;
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
interface CharacterCardRow {
  id: string;
  name: string;
  avatar: string | null;
  tagline: string;
  personality: string;
  speech_style: string;
  likes_and_dislikes: string;
  scenario: string;
  first_message: string | null;
  relationship_state: string;
  length_guidance: string | null;
  alternate_greetings: string;
  mes_example: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  creator: string | null;
  creator_notes: string | null;
  character_version: string | null;
  world_info: string;
  extensions: string;
  cover_image: string | null;
  creator_name: string | null;
  tags: string;
  description: string | null;
  prologue_preview: string | null;
  stats: string;
  created_at: number;
  updated_at: number;
}

/** Deserialize a DB row into a full `CharacterCard`. */
function rowToCard(row: CharacterCardRow): CharacterCard {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    tagline: row.tagline,
    personality: row.personality,
    speech_style: row.speech_style,
    likes_and_dislikes: row.likes_and_dislikes,
    scenario: row.scenario,
    first_message: row.first_message,
    relationship_state: parseJson<RelationshipState>(row.relationship_state, {
      affection: 0,
      trust: 0,
      flags: [],
    }),
    length_guidance: row.length_guidance,
    alternate_greetings: parseJson<string[]>(row.alternate_greetings, []),
    mes_example: row.mes_example,
    system_prompt: row.system_prompt,
    post_history_instructions: row.post_history_instructions,
    creator: row.creator,
    creator_notes: row.creator_notes,
    character_version: row.character_version,
    world_info: parseJson<WorldInfoEntry[]>(row.world_info, []),
    extensions: parseJson<Record<string, unknown>>(row.extensions, {}),
    cover_image: row.cover_image,
    creator_name: row.creator_name,
    tags: parseJson<string[]>(row.tags, []),
    description: row.description,
    prologue_preview: row.prologue_preview,
    stats: parseJson<CardStats>(row.stats, {
      replay_count: 0,
      like_count: 0,
      comment_count: 0,
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Columns returned by SELECT queries (matches `CharacterCardRow`). */
const SELECT_COLS = [
  'id', 'name', 'avatar', 'tagline', 'personality', 'speech_style',
  'likes_and_dislikes', 'scenario', 'first_message', 'relationship_state',
  'length_guidance', 'alternate_greetings', 'mes_example', 'system_prompt',
  'post_history_instructions', 'creator', 'creator_notes', 'character_version',
  'world_info', 'extensions', 'cover_image', 'creator_name', 'tags',
  'description', 'prologue_preview', 'stats', 'created_at', 'updated_at',
].join(', ');

/** List all character cards, newest first. */
export function listCharacterCards(): CharacterCard[] {
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM character_card ORDER BY created_at DESC`)
    .all() as unknown as CharacterCardRow[];
  return rows.map(rowToCard);
}

/** Get a single character card by id, or undefined. */
export function getCharacterCard(id: string): CharacterCard | undefined {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM character_card WHERE id = ?`)
    .get(id) as unknown as CharacterCardRow | undefined;
  return row ? rowToCard(row) : undefined;
}

/** Input for creating a new card. Only `name` is required. */
export interface CreateCharacterCardInput {
  name: string;
  avatar?: string | undefined;
  tagline?: string | undefined;
  personality?: string | undefined;
  speech_style?: string | undefined;
  likes_and_dislikes?: string | undefined;
  scenario?: string | undefined;
  first_message?: string | undefined;
  relationship_state?: RelationshipState | undefined;
  length_guidance?: string | undefined;
  alternate_greetings?: string[] | undefined;
  mes_example?: string | undefined;
  system_prompt?: string | undefined;
  post_history_instructions?: string | undefined;
  creator?: string | undefined;
  creator_notes?: string | undefined;
  character_version?: string | undefined;
  world_info?: WorldInfoEntry[] | undefined;
  extensions?: Record<string, unknown> | undefined;
  cover_image?: string | undefined;
  creator_name?: string | undefined;
  tags?: string[] | undefined;
  description?: string | undefined;
  prologue_preview?: string | undefined;
  stats?: CardStats | undefined;
}

/** Create a character card, returning the full row. */
export function createCharacterCard(input: CreateCharacterCardInput): CharacterCard {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  const rel = input.relationship_state ?? { affection: 0, trust: 0, flags: [] };
  const stats = input.stats ?? { replay_count: 0, like_count: 0, comment_count: 0 };

  db.prepare(
    `INSERT INTO character_card (
      id, name, avatar, tagline, personality, speech_style, likes_and_dislikes,
      scenario, first_message, relationship_state, length_guidance,
      alternate_greetings, mes_example, system_prompt, post_history_instructions,
      creator, creator_notes, character_version, world_info, extensions,
      cover_image, creator_name, tags, description, prologue_preview, stats,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.avatar ?? null,
    input.tagline ?? '',
    input.personality ?? '',
    input.speech_style ?? '',
    input.likes_and_dislikes ?? '',
    input.scenario ?? '',
    input.first_message ?? null,
    JSON.stringify(rel),
    input.length_guidance ?? null,
    JSON.stringify(input.alternate_greetings ?? []),
    input.mes_example ?? null,
    input.system_prompt ?? null,
    input.post_history_instructions ?? null,
    input.creator ?? null,
    input.creator_notes ?? null,
    input.character_version ?? null,
    JSON.stringify(input.world_info ?? []),
    JSON.stringify(input.extensions ?? {}),
    input.cover_image ?? null,
    input.creator_name ?? null,
    JSON.stringify(input.tags ?? []),
    input.description ?? null,
    input.prologue_preview ?? null,
    JSON.stringify(stats),
    now,
    now,
  );

  return getCharacterCard(id)!;
}

/** Partial patch for updating a card. All fields optional. */
export interface UpdateCharacterCardInput {
  name?: string | undefined;
  avatar?: string | null | undefined;
  tagline?: string | undefined;
  personality?: string | undefined;
  speech_style?: string | undefined;
  likes_and_dislikes?: string | undefined;
  scenario?: string | undefined;
  first_message?: string | null | undefined;
  relationship_state?: RelationshipState | undefined;
  length_guidance?: string | null | undefined;
  alternate_greetings?: string[] | undefined;
  mes_example?: string | null | undefined;
  system_prompt?: string | null | undefined;
  post_history_instructions?: string | null | undefined;
  creator?: string | null | undefined;
  creator_notes?: string | null | undefined;
  character_version?: string | null | undefined;
  world_info?: WorldInfoEntry[] | undefined;
  extensions?: Record<string, unknown> | undefined;
  cover_image?: string | null | undefined;
  creator_name?: string | null | undefined;
  tags?: string[] | undefined;
  description?: string | null | undefined;
  prologue_preview?: string | null | undefined;
  stats?: CardStats | undefined;
}

/** Columns whose JSON values need `JSON.stringify` when patching. */
const JSON_COLUMNS = new Set([
  'relationship_state', 'alternate_greetings', 'world_info', 'extensions',
  'tags', 'stats',
]);

/**
 * Update a character card by id. Returns the updated card, or undefined
 * if the id doesn't exist. Only provided fields are written; the rest
 * are left untouched.
 */
export function updateCharacterCard(
  id: string,
  patch: UpdateCharacterCardInput,
): CharacterCard | undefined {
  const existing = getCharacterCard(id);
  if (!existing) return undefined;

  const db = getDb();
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  // Walk the patch and build SET clauses. JSON columns get stringified;
  // scalar columns are passed through directly.
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    const column = key as keyof UpdateCharacterCardInput;
    sets.push(`${column} = ?`);
    if (JSON_COLUMNS.has(column)) {
      values.push(JSON.stringify(val));
    } else {
      values.push(val);
    }
  }

  values.push(id);
  db.prepare(`UPDATE character_card SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getCharacterCard(id);
}

/**
 * Delete a character card by id. Returns true if a row was deleted.
 */
export function deleteCharacterCard(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM character_card WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

// ── Test fixture (Phase 1, checklist item 3) ───────────────────────────

/**
 * Hardcoded test card — a senior disciple in the Orthodox Murim, so there is
 * a real persona to talk to before card CRUD exists (Phase 1, item 3).
 */
export const YEHWA_CARD: CharacterCard = {
  id: 'yehwa',
  name: 'Yehwa',
  avatar: null,
  tagline: 'Senior disciple of the Orthodox Murim, first in line under Master Jeong.',
  personality:
    'Dutiful, composed, and quietly protective. As senior disciple, Yehwa carries the weight of ' +
    'being first under Master Jeong — setting the example, keeping the juniors in line, and ' +
    'answering for all of them when they stumble. Stern about training and etiquette, but the ' +
    'sharpness is a shield; underneath is a warm elder who worries about the junior disciples far ' +
    'more than they will ever admit. Teasing is their love language, delivered deadpan.',
  speech_style:
    'Measured and formal toward strangers; dry, teasing warmth with the junior disciples. ' +
    'Addresses the user as "Junior" and expects "Senior" in return. Quotes the martial classics to ' +
    'make a point. A sigh and a leveled gaze are the heaviest weapons in the arsenal.',
  likes_and_dislikes:
    'Likes: dawn sword forms on the training pavilion, plum blossom tea, quiet mountain evenings, ' +
    'watching the juniors improve, a well-landed technique. Dislikes: sloppy stances, skipped ' +
    'drills, braggarts, unorthodox sects poking into orthodox territory, the junior disciple ' +
    'wandering off without a word.',
  scenario:
    'Both Yehwa and the user are disciples of the Orthodox Murim sect on Mount Cheongun, under the ' +
    'same master, Jeong. The user is the youngest disciple; Yehwa is the senior disciple who ' +
    'watches over them. It is a calm evening — the training yard quiet, incense drifting from the ' +
    'pavilion — and Yehwa has been waiting.',
  first_message:
    '"Finally. Three incense-sticks late, Junior. Master Jeong asked me to keep an eye on you. ' +
    'Care to explain where you were — or should I make you run the mountain steps tomorrow?"',
  relationship_state: { affection: 35, trust: 45, flags: [] },
  length_guidance: '1-3 sentences unless the moment calls for more.',
  alternate_greetings: [],
  mes_example: null,
  system_prompt: null,
  post_history_instructions: null,
  creator: null,
  creator_notes: null,
  character_version: null,
  world_info: [],
  extensions: {},
  cover_image: null,
  creator_name: null,
  tags: [],
  description: null,
  prologue_preview: null,
  stats: { replay_count: 0, like_count: 0, comment_count: 0 },
  created_at: 0,
  updated_at: 0,
};
