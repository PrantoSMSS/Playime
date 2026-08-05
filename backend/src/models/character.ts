/**
 * Character card — the persona data model (CLAUDE.md "Data model quick
 * reference", PLAYIME_ROADMAP.md §3).
 *
 * Phase 2 foundation: full CharacterCard interface (core persona + Tavern
 * V2/V3 compatibility + card-browser metadata) backed by SQLite CRUD.
 * The `YEHWA_CARD` test fixture stays as the Phase 1 hardcoded persona.
 *
 * The running key-event timeline is per-session (`session_event` table),
 * never a card field (CLAUDE.md "Memory system" layer 2).
 * `relationship_state` here is the card's starting state; per-session
 * evolution lands with Phase 2's structured extraction.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Avatar option for a card — a selectable visual representation.
 * Cards can define multiple avatars; the user picks one at New Play time.
 */
export interface AvatarOption {
  /** Stable identifier — never an array index. */
  id: string;
  /** Display name (optional). */
  name?: string | undefined;
  /** Image path or data URI. */
  image: string;
}

/**
 * Character/Story-level default persona — predefined narrative identity designed
 * by the card author. The name is a placeholder (`{{player_name}}`) that gets
 * replaced with user input at session creation time.
 */
export interface DefaultPersona {
  /** Narrative label shown in the UI (e.g. "Childhood friend", "New student"). */
  label?: string | undefined;
  /** Player name placeholder — typically "{{player_name}}", replaced at session creation. */
  name: string;
  /** Player's role in this story (e.g. "Teacher", "Student"). */
  role?: string | undefined;
  /** Player's background. */
  background?: string | undefined;
  /** Player's personality traits. */
  personality?: string | undefined;
  /** Player's appearance. */
  appearance?: string | undefined;
  /** Player's pronouns. */
  pronouns?: string | undefined;
  /** Any other narrative details. */
  details?: string | undefined;
}

/**
 * Starting scenario — a distinct opening context with its own scenario text
 * and first message. Different from alternate_greetings (same scenario,
 * different greeting) — a scenario represents a different starting context.
 */
export interface StartingScenario {
  /** Stable identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Optional description shown in the picker. */
  description?: string | undefined;
  /** The scenario text injected into the prompt. */
  scenario: string;
  /** The opening/first message for this scenario. */
  first_message: string;
}

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

  // Multiple avatars and starting scenarios
  avatars: AvatarOption[];
  starting_scenarios: StartingScenario[];

  // Character/Story-level default persona
  default_persona: DefaultPersona | null;

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
  avatar_file: string | null;
  cover_file: string | null;
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
  avatars: string;
  starting_scenarios: string;
  default_persona: string | null;
  alternate_greetings: string;
  mes_example: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  creator: string | null;
  creator_notes: string | null;
  character_version: string | null;
  world_info: string;
  extensions: string;
  avatar_file: string | null;
  cover_file: string | null;
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
    avatars: parseJson<AvatarOption[]>(row.avatars, []),
    starting_scenarios: parseJson<StartingScenario[]>(row.starting_scenarios, []),
    default_persona: parseJson<DefaultPersona | null>(row.default_persona, null),
    alternate_greetings: parseJson<string[]>(row.alternate_greetings, []),
    mes_example: row.mes_example,
    system_prompt: row.system_prompt,
    post_history_instructions: row.post_history_instructions,
    creator: row.creator,
    creator_notes: row.creator_notes,
    character_version: row.character_version,
    world_info: parseJson<WorldInfoEntry[]>(row.world_info, []),
    extensions: parseJson<Record<string, unknown>>(row.extensions, {}),
    avatar_file: row.avatar_file ?? null,
    cover_file: row.cover_file ?? null,
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

/**
 * Normalize a card's avatars field — if empty, build a default from the legacy
 * `avatar` field. This ensures backward compatibility: cards without explicit
 * avatars still have a usable default option.
 */
export function normalizeAvatars(card: CharacterCard): AvatarOption[] {
  if (card.avatars.length > 0) return card.avatars;
  if (card.avatar) {
    return [{ id: 'default', name: 'Default', image: card.avatar }];
  }
  return [];
}

/**
 * Normalize a card's starting_scenarios field — if empty, build a default from
 * the legacy `scenario` and `first_message` fields.
 */
export function normalizeStartingScenarios(card: CharacterCard): StartingScenario[] {
  if (card.starting_scenarios.length > 0) return card.starting_scenarios;
  if (card.scenario || card.first_message) {
    return [{
      id: 'default',
      name: 'Default',
      scenario: card.scenario,
      first_message: card.first_message ?? '',
    }];
  }
  return [];
}

/**
 * Resolve an avatar option by ID from a card. Returns undefined if the ID
 * doesn't match any avatar.
 */
export function resolveAvatar(card: CharacterCard, avatarId: string): AvatarOption | undefined {
  const avatars = normalizeAvatars(card);
  return avatars.find((a) => a.id === avatarId);
}

/**
 * Resolve a starting scenario by ID from a card. Returns undefined if the ID
 * doesn't match any scenario.
 */
export function resolveStartingScenario(
  card: CharacterCard,
  scenarioId: string,
): StartingScenario | undefined {
  const scenarios = normalizeStartingScenarios(card);
  return scenarios.find((s) => s.id === scenarioId);
}

/** Columns returned by SELECT queries (matches `CharacterCardRow`). */
const SELECT_COLS = [
  'id', 'name', 'avatar', 'tagline', 'personality', 'speech_style',
  'likes_and_dislikes', 'scenario', 'first_message', 'relationship_state',
  'length_guidance', 'avatars', 'starting_scenarios', 'default_persona',
  'alternate_greetings',
  'mes_example', 'system_prompt', 'post_history_instructions', 'creator',
  'creator_notes', 'character_version', 'world_info', 'extensions',
  'avatar_file', 'cover_file', 'cover_image', 'creator_name', 'tags', 'description', 'prologue_preview',
  'stats', 'created_at', 'updated_at',
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
  avatars?: AvatarOption[] | undefined;
  starting_scenarios?: StartingScenario[] | undefined;
  default_persona?: DefaultPersona | null | undefined;
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
  avatar_file?: string | null | undefined;
  cover_file?: string | null | undefined;
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

  // Build default avatars and starting_scenarios from legacy fields if not provided
  const avatars = input.avatars ?? (input.avatar
    ? [{ id: 'default', name: 'Default', image: input.avatar }]
    : []);
  const startingScenarios = input.starting_scenarios ?? (input.scenario || input.first_message
    ? [{
        id: 'default',
        name: 'Default',
        scenario: input.scenario ?? '',
        first_message: input.first_message ?? '',
      }]
    : []);

  db.prepare(
    `INSERT INTO character_card (
      id, name, avatar, tagline, personality, speech_style, likes_and_dislikes,
      scenario, first_message, relationship_state, length_guidance,
      avatars, starting_scenarios, default_persona, alternate_greetings, mes_example,
      system_prompt, post_history_instructions, creator, creator_notes,
      character_version, world_info, extensions, avatar_file, cover_file,
      cover_image, creator_name, tags, description, prologue_preview, stats, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify(avatars),
    JSON.stringify(startingScenarios),
    input.default_persona ? JSON.stringify(input.default_persona) : null,
    JSON.stringify(input.alternate_greetings ?? []),
    input.mes_example ?? null,
    input.system_prompt ?? null,
    input.post_history_instructions ?? null,
    input.creator ?? null,
    input.creator_notes ?? null,
    input.character_version ?? null,
    JSON.stringify(input.world_info ?? []),
    JSON.stringify(input.extensions ?? {}),
    input.avatar_file ?? null,
    input.cover_file ?? null,
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
  avatars?: AvatarOption[] | undefined;
  starting_scenarios?: StartingScenario[] | undefined;
  default_persona?: DefaultPersona | null | undefined;
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
  avatar_file?: string | null | undefined;
  cover_file?: string | null | undefined;
  creator_name?: string | null | undefined;
  tags?: string[] | undefined;
  description?: string | null | undefined;
  prologue_preview?: string | null | undefined;
  stats?: CardStats | undefined;
}

/** Columns whose JSON values need `JSON.stringify` when patching. */
const JSON_COLUMNS = new Set([
  'relationship_state', 'avatars', 'starting_scenarios', 'default_persona',
  'alternate_greetings', 'world_info', 'extensions', 'tags', 'stats',
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
  avatars: [],
  starting_scenarios: [
    {
      id: 'evening',
      name: 'Evening Training',
      scenario: 'Both Yehwa and the user are disciples of the Orthodox Murim sect on Mount Cheongun, under the same master, Jeong. The user is the youngest disciple; Yehwa is the senior disciple who watches over them. It is a calm evening — the training yard quiet, incense drifting from the pavilion — and Yehwa has been waiting.',
      first_message: '"Finally. Three incense-sticks late, Junior. Master Jeong asked me to keep an eye on you. Care to explain where you were — or should I make you run the mountain steps tomorrow?"',
    },
    {
      id: 'plum',
      name: 'Plum Blossom Tea',
      scenario: 'Yehwa and the user are taking a break in the pavilion. A pot of plum blossom tea sits between them. The afternoon light filters through the window, and Yehwa is watching the user with that characteristic dry expression.',
      first_message: '"You are quiet today, Junior. Even for you." *A cup of plum blossom tea is set before you.* "Drink. Then tell me what is on your mind."',
    },
    {
      id: 'night-watch',
      name: 'Night Watch',
      scenario: 'It is late at night on the eastern wall of the sect. Yehwa and the user are on watch duty together. The moon is full, casting long shadows across the battlements. Yehwa stands alert, hand resting on the hilt of their sword.',
      first_message: '"The east wall is quiet tonight. Too quiet for a full moon." *Yehwa\'s hand rests on the hilt, easy and practiced.* "Keep your eyes open, Junior. Trouble has a way of finding us when we least expect it."',
    },
  ],
  default_persona: {
    label: 'Junior Disciple',
    name: '{{player_name}}',
    role: 'Junior Disciple of the Orthodox Murim',
    background: 'The youngest disciple under Master Jeong, training alongside Yehwa on Mount Cheongun',
    personality: 'Dedicated, eager to prove themselves, but still learning the ways of the sect',
  },
  alternate_greetings: [],
  mes_example: null,
  system_prompt: null,
  post_history_instructions: null,
  creator: null,
  creator_notes: null,
  character_version: null,
  world_info: [],
  extensions: {},
  avatar_file: null,
  cover_file: null,
  cover_image: null,
  creator_name: null,
  tags: [],
  description: null,
  prologue_preview: null,
  stats: { replay_count: 0, like_count: 0, comment_count: 0 },
  created_at: 0,
  updated_at: 0,
};

/**
 * Miko test card — a childhood friend who shows up unannounced.
 */
export const MIKO_CARD: CharacterCard = {
  id: '215fb191-9d97-45eb-8029-394ab92fe0d7',
  name: 'Miko',
  avatar: null,
  tagline: 'Your childhood friend who always shows up when you least expect it.',
  personality:
    'Cheerful, energetic, and a bit reckless. Miko has a habit of appearing out of nowhere ' +
    'and dragging you into adventures. She\'s fiercely loyal and will do anything for her friends, ' +
    'but she can be impulsive and doesn\'t always think things through. Her humor is playful ' +
    'and she loves to tease, but it comes from a place of genuine affection.',
  speech_style:
    'Casual and upbeat, with frequent use of slang and exclamations. She calls the user by their ' +
    'name or nicknames like "hey you" or "partner". Her speech is peppered with "!" and "..." ' +
    'for dramatic effect. She\'s not afraid to be direct and says what she thinks.',
  likes_and_dislikes:
    'Likes: spontaneous adventures, street food, stargazing, collecting interesting rocks, ' +
    'making people smile. Dislikes: being bored, strict schedules, mean people, being told ' +
    'she can\'t do something, rainy days that keep her indoors.',
  scenario:
    'Miko and the user grew up together in a small town. She moved away years ago but has ' +
    'always kept in touch through messages and calls. Today, she\'s suddenly shown up at the ' +
    'user\'s doorstep, soaked from the rain, with a big grin on her face.',
  first_message:
    '*She stands in the doorway, soaked, hair clinging to her face — and smiles like no time has passed at all.* ...Hey. You gonna let me in, or do I have to cry on your doorstep?',
  relationship_state: { affection: 60, trust: 70, flags: ['childhood_friend'] },
  length_guidance: '1-3 sentences, casual and conversational.',
  avatars: [],
  starting_scenarios: [
    {
      id: 'doorstep',
      name: 'Doorstep Surprise',
      scenario: 'Miko has just shown up at {{player_name}}\'s doorstep, soaked from the rain. She\'s grinning like she doesn\'t have a care in the world.',
      first_message: '*She stands in the doorway, soaked, hair clinging to her face — and smiles like no time has passed at all.* ...Hey. You gonna let me in, or do I have to cry on your doorstep?',
    },
    {
      id: 'cafe',
      name: 'Coffee Shop Encounter',
      scenario: '{{player_name}} is at their favorite coffee shop when Miko suddenly slides into the seat across from them, looking way too pleased with herself.',
      first_message: '*She drops into the chair across from you, grinning.* Guess who just got back in town? ...Okay fine, it\'s me. Miss me?',
    },
    {
      id: 'park',
      name: 'Park Meeting',
      scenario: 'Miko has asked {{player_name}} to meet her at the old park where they used to hang out as kids. She\'s already there, sitting on their favorite bench.',
      first_message: '*She looks up from the bench, eyes lighting up when she sees you.* Hey! You actually came. I was half expecting you\'d flake on me again.',
    },
  ],
  default_persona: null,
  alternate_greetings: [],
  mes_example: null,
  system_prompt: null,
  post_history_instructions: null,
  creator: null,
  creator_notes: null,
  character_version: null,
  world_info: [],
  extensions: {},
  avatar_file: null,
  cover_file: null,
  cover_image: null,
  creator_name: null,
  tags: [],
  description: null,
  prologue_preview: null,
  stats: { replay_count: 0, like_count: 0, comment_count: 0 },
  created_at: 0,
  updated_at: 0,
};
