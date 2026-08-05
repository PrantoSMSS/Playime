/**
 * SillyTavern-compatible card parser — normalizes V1/V2/V3 JSON (from PNG
 * tEXt chunks or standalone .json files) onto Playime's `CharacterCard`
 * interface.
 *
 * Spec reference: SillyTavern `src/validator/TavernCardValidator.js`,
 * `src/types/spec-v2.d.ts`, RisuAI `src/ts/characterCards.ts`.
 *
 * V1 — flat fields: name, description, personality, scenario, first_mes, mes_example
 * V2 — wrapped: { spec: 'chara_card_v2', spec_version: '2.0', data: { ... } }
 * V3 — superset:  { spec: 'chara_card_v3', spec_version: '3.0', data: { ..., assets, ... } }
 *
 * Off-spec fallback handles KoboldAI-style exports (char_name, char_persona,
 * char_greeting) and other non-standard shapes.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvatarOption, CharacterCard, StartingScenario, WorldInfoEntry } from '../models/character.js';
import { ensureEntityDir } from '../storage.js';

// ── SillyTavern raw types (what we receive, before normalization) ───────

interface SillyTavernV1 {
  name?: string | undefined;
  description?: string | undefined;
  personality?: string | undefined;
  scenario?: string | undefined;
  first_mes?: string | undefined;
  mes_example?: string | undefined;
  // Off-spec extensions sometimes present on V1-ish cards
  char_name?: string | undefined;
  char_persona?: string | undefined;
  char_greeting?: string | undefined;
  spec_version?: string | undefined;
}

interface SillyTavernV2Data {
  name?: string | undefined;
  description?: string | undefined;
  personality?: string | undefined;
  scenario?: string | undefined;
  first_mes?: string | undefined;
  mes_example?: string | undefined;
  creator_notes?: string | undefined;
  system_prompt?: string | undefined;
  post_history_instructions?: string | undefined;
  alternate_greetings?: string[] | undefined;
  character_book?: SillyTavernCharacterBook | undefined;
  tags?: string[] | undefined;
  creator?: string | undefined;
  character_version?: string | undefined;
  extensions?: Record<string, unknown> | undefined;
  // V3 extras (superset — present when spec is v3)
  group_only_greetings?: string[] | undefined;
  nickname?: string | undefined;
  source?: string[] | undefined;
  creation_date?: number | undefined;
  modification_date?: number | undefined;
  assets?: SillyTavernAsset[] | undefined;
}

interface SillyTavernV2 {
  spec: string;
  spec_version: string;
  data: SillyTavernV2Data;
}

interface SillyTavernCharacterBook {
  name?: string | undefined;
  description?: string | undefined;
  scan_depth?: number | undefined;
  token_budget?: number | undefined;
  recursive_scanning?: boolean | undefined;
  extensions?: Record<string, unknown> | undefined;
  entries?: SillyTavernLorebookEntry[] | undefined;
}

interface SillyTavernLorebookEntry {
  keys?: string[] | undefined;
  secondary_keys?: string[] | undefined;
  content?: string | undefined;
  extensions?: Record<string, unknown> | undefined;
  enabled?: boolean | undefined;
  insertion_order?: number | undefined;
  case_sensitive?: boolean | undefined;
  name?: string | undefined;
  priority?: number | undefined;
  id?: number | undefined;
  comment?: string | undefined;
  selective?: boolean | undefined;
  selectiveLogic?: number | undefined;
  constant?: boolean | undefined;
  position?: string | undefined;
  use_regex?: boolean | undefined;
  probability?: number | undefined;
}

interface SillyTavernAsset {
  type?: string | undefined;
  uri?: string | undefined;
  name?: string | undefined;
  ext?: string | undefined;
}

// ── Detection ──────────────────────────────────────────────────────────

type CardVersion = 'v1' | 'v2' | 'v3' | 'offspec';

function detectVersion(raw: Record<string, unknown>): CardVersion {
  const spec = raw['spec'];
  const specVersion = raw['spec_version'];

  if (spec === 'chara_card_v3') {
    return 'v3';
  }
  if (spec === 'chara_card_v2') {
    return 'v2';
  }

  // V1: has the six required flat fields (or their off-spec equivalents)
  const hasV1Fields =
    (typeof raw['name'] === 'string' || typeof raw['char_name'] === 'string') &&
    (typeof raw['description'] === 'string' || typeof raw['char_persona'] === 'string') &&
    (typeof raw['first_mes'] === 'string' || typeof raw['char_greeting'] === 'string');

  if (hasV1Fields && typeof specVersion === 'string' && specVersion.startsWith('1')) {
    return 'v1';
  }

  if (hasV1Fields) {
    return 'v1';
  }

  // Off-spec fallback: KoboldAI-style (char_name, char_persona, char_greeting)
  if (typeof raw['char_name'] === 'string' && typeof raw['char_greeting'] === 'string') {
    return 'offspec';
  }

  throw new Error(
    `Unrecognized card format — expected V1/V2/V3 spec or off-spec fields ` +
    `(char_name/char_greeting). Found keys: ${Object.keys(raw).join(', ')}`,
  );
}

// ── World info conversion ──────────────────────────────────────────────

/** SillyTavern selective_logic extension values → Playime enum. */
function mapSelectiveLogic(val: unknown): 'AND' | 'NOT' | undefined {
  if (typeof val !== 'number') return undefined;
  if (val === 0) return 'AND'; // AND (both keys required)
  if (val === 2) return 'NOT'; // NOT (exclude secondary)
  return undefined; // other values don't map cleanly
}

/** Convert a SillyTavern lorebook entry to Playime's WorldInfoEntry. */
function convertLoreEntry(entry: SillyTavernLorebookEntry): WorldInfoEntry {
  return {
    keys: entry.keys ?? [],
    secondary_keys: entry.secondary_keys,
    selective: entry.selective,
    selective_logic: mapSelectiveLogic(entry.selectiveLogic),
    constant: entry.constant,
    content: entry.content ?? '',
    insertion_order: entry.insertion_order ?? 0,
    priority: entry.priority,
    position: entry.position === 'before_char' || entry.position === 'after_char'
      ? entry.position
      : undefined,
    case_sensitive: entry.case_sensitive,
    enabled: entry.enabled ?? true,
  };
}

/** Convert a SillyTavern character_book to Playime WorldInfoEntry[]. */
function convertCharacterBook(
  book: SillyTavernCharacterBook | undefined,
): WorldInfoEntry[] {
  if (!book?.entries) return [];
  return book.entries.map(convertLoreEntry);
}

// ── Main parser ────────────────────────────────────────────────────────

/**
 * Parse a raw JSON object (from PNG tEXt chunk or standalone .json) into
 * a partial `CharacterCard` suitable for `createCharacterCard()`.
 *
 * Fields not present in the source are left as their defaults (empty string,
 * null, or empty array). The caller should call `createCharacterCard()` with
 * the returned object to persist it.
 */
export function parseSillyTavernCard(
  raw: Record<string, unknown>,
): Partial<CharacterCard> {
  const version = detectVersion(raw);

  switch (version) {
    case 'v3':
      return parseV2OrV3(raw as unknown as SillyTavernV2, 'v3');
    case 'v2':
      return parseV2OrV3(raw as unknown as SillyTavernV2, 'v2');
    case 'v1':
      return parseV1(raw as unknown as SillyTavernV1);
    case 'offspec':
      return parseOffSpec(raw as unknown as SillyTavernV1);
  }
}

// ── V2 / V3 ───────────────────────────────────────────────────────────

function parseV2OrV3(
  card: SillyTavernV2,
  version: 'v2' | 'v3',
): Partial<CharacterCard> {
  const data = card.data;
  const extensions = data.extensions ?? {};

  // V3 assets: extract avatar and cover from icon/background types
  let avatar: string | null = null;
  let coverImage: string | null = null;
  if (version === 'v3' && data.assets) {
    for (const asset of data.assets) {
      if (asset.type === 'icon' && asset.uri && !asset.uri.startsWith('ccdefault:')) {
        avatar = asset.uri;
      }
      if (asset.type === 'background' && asset.uri) {
        coverImage = asset.uri;
      }
    }
  }

  // Build avatars array from the imported avatar
  const avatars: AvatarOption[] = avatar
    ? [{ id: 'default', name: 'Default', image: avatar }]
    : [];

  // Build starting_scenarios from scenario + first_mes + alternate_greetings
  const startingScenarios: StartingScenario[] = [];
  if (data.scenario || data.first_mes) {
    startingScenarios.push({
      id: 'default',
      name: 'Default',
      scenario: data.scenario ?? '',
      first_message: data.first_mes ?? '',
    });
  }

  // V3 extras that don't map to core fields — preserve in extensions
  const v3Extras: Record<string, unknown> = {};
  if (version === 'v3') {
    if (data.group_only_greetings) v3Extras['group_only_greetings'] = data.group_only_greetings;
    if (data.nickname) v3Extras['nickname'] = data.nickname;
    if (data.source) v3Extras['source'] = data.source;
    if (data.creation_date) v3Extras['creation_date'] = data.creation_date;
    if (data.modification_date) v3Extras['modification_date'] = data.modification_date;
  }

  return {
    name: data.name ?? '',
    avatar: avatar,
    tagline: data.description ?? '',
    personality: data.personality ?? '',
    speech_style: '',
    likes_and_dislikes: '',
    scenario: data.scenario ?? '',
    first_message: data.first_mes ?? null,
    relationship_state: { affection: 0, trust: 0, flags: [] },
    length_guidance: null,

    avatars: avatars,
    starting_scenarios: startingScenarios,
    alternate_greetings: data.alternate_greetings ?? [],
    mes_example: data.mes_example ?? null,
    system_prompt: data.system_prompt ?? null,
    post_history_instructions: data.post_history_instructions ?? null,
    creator: data.creator ?? null,
    creator_notes: data.creator_notes ?? null,
    character_version: data.character_version ?? null,
    world_info: convertCharacterBook(data.character_book),
    extensions: Object.keys(extensions).length > 0 || Object.keys(v3Extras).length > 0
      ? { ...extensions, ...(Object.keys(v3Extras).length > 0 ? { _v3: v3Extras } : {}) }
      : {},

    cover_image: coverImage,
    creator_name: data.creator ?? null,
    tags: data.tags ?? [],
    description: data.description ?? null,
    prologue_preview: data.first_mes ?? null,
  };
}

// ── V1 ─────────────────────────────────────────────────────────────────

function parseV1(card: SillyTavernV1): Partial<CharacterCard> {
  // Build starting_scenarios from scenario + first_mes
  const startingScenarios: StartingScenario[] = [];
  if (card.scenario || card.first_mes) {
    startingScenarios.push({
      id: 'default',
      name: 'Default',
      scenario: card.scenario ?? '',
      first_message: card.first_mes ?? '',
    });
  }

  return {
    name: card.name ?? '',
    tagline: card.description ?? '',
    personality: card.personality ?? '',
    speech_style: '',
    likes_and_dislikes: '',
    scenario: card.scenario ?? '',
    first_message: card.first_mes ?? null,
    relationship_state: { affection: 0, trust: 0, flags: [] },
    length_guidance: null,

    avatars: [],
    starting_scenarios: startingScenarios,
    alternate_greetings: [],
    mes_example: card.mes_example ?? null,
    system_prompt: null,
    post_history_instructions: null,
    creator: null,
    creator_notes: null,
    character_version: null,
    world_info: [],
    extensions: {},

    tags: [],
    description: card.description ?? null,
    prologue_preview: card.first_mes ?? null,
  };
}

// ── Off-spec fallback (KoboldAI-style) ─────────────────────────────────

function parseOffSpec(card: SillyTavernV1): Partial<CharacterCard> {
  // Build starting_scenarios from scenario + first_mes/greeting
  const firstMessage = card.char_greeting ?? card.first_mes ?? '';
  const startingScenarios: StartingScenario[] = [];
  if (card.scenario || firstMessage) {
    startingScenarios.push({
      id: 'default',
      name: 'Default',
      scenario: card.scenario ?? '',
      first_message: firstMessage,
    });
  }

  return {
    name: card.char_name ?? card.name ?? '',
    tagline: card.char_persona ?? card.description ?? '',
    personality: card.char_persona ?? card.personality ?? '',
    speech_style: '',
    likes_and_dislikes: '',
    scenario: card.scenario ?? '',
    first_message: firstMessage || null,
    relationship_state: { affection: 0, trust: 0, flags: [] },
    length_guidance: null,

    avatars: [],
    starting_scenarios: startingScenarios,
    alternate_greetings: [],
    mes_example: card.mes_example ?? null,
    system_prompt: null,
    post_history_instructions: null,
    creator: null,
    creator_notes: null,
    character_version: null,
    world_info: [],
    extensions: {},

    tags: [],
    description: card.description ?? null,
    prologue_preview: firstMessage || null,
  };
}

// ── Avatar persistence ───────────────────────────────────────────────

/**
 * Download or decode avatar and save to entity folder.
 * Returns local filename.
 */
export async function saveAvatarLocally(
  cardId: string,
  avatarValue: string | null,
): Promise<string | null> {
  if (!avatarValue) return null;

  const entityDir = ensureEntityDir('characters', cardId);

  if (avatarValue.startsWith('data:')) {
    // Decode base64 data URI
    const base64 = avatarValue.split(',')[1] ?? '';
    const buffer = Buffer.from(base64, 'base64');
    const ext = avatarValue.includes('image/png') ? 'png' : 'jpg';
    const filename = `avatar.${ext}`;
    writeFileSync(join(entityDir, filename), buffer);
    return filename;
  }

  if (avatarValue.startsWith('http://') || avatarValue.startsWith('https://')) {
    // Fetch from URL
    const resp = await fetch(avatarValue);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || '';
    const ext = contentType.includes('image/png') ? 'png' : 'jpg';
    const filename = `avatar.${ext}`;
    writeFileSync(join(entityDir, filename), buffer);
    return filename;
  }

  // Already a relative path or unknown format
  return null;
}
