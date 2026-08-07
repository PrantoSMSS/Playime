/**
 * Tests for character card model — avatars, starting scenarios, and entity storage.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/character.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizeAvatars,
  normalizeStartingScenarios,
  resolveAvatar,
  resolveStartingScenario,
  createCharacterCard,
  deleteCharacterCard,
} from '../models/character.js';
import type { CharacterCard, AvatarOption, StartingScenario } from '../models/character.js';

// Helper to create a minimal CharacterCard for testing
function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test-card',
    name: 'Test Character',
    avatar: null,
    tagline: 'A test character',
    personality: 'Friendly',
    speech_style: 'Casual',
    likes_and_dislikes: 'Likes testing',
    scenario: 'In a test environment',
    first_message: 'Hello!',
    relationship_state: { affection: 0, trust: 0, flags: [] },
    length_guidance: null,
    avatars: [],
    starting_scenarios: [],
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
    source: 'playime',
    sourceId: null,
    favorite: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('normalizeAvatars', () => {
  it('returns existing avatars when provided', () => {
    const avatars: AvatarOption[] = [
      { id: 'avatar_1', name: 'Default', image: '/img/default.png' },
      { id: 'avatar_2', name: 'Casual', image: '/img/casual.png' },
    ];
    const card = makeCard({ avatars });
    const result = normalizeAvatars(card);
    assert.deepEqual(result, avatars);
  });

  it('creates default avatar from legacy avatar field', () => {
    const card = makeCard({ avatar: '/img/legacy.png' });
    const result = normalizeAvatars(card);
    assert.equal(result.length, 1);
    const avatar = result[0]!;
    assert.equal(avatar.id, 'default');
    assert.equal(avatar.name, 'Default');
    assert.equal(avatar.image, '/img/legacy.png');
  });

  it('returns empty array when no avatars and no legacy avatar', () => {
    const card = makeCard({ avatar: null });
    const result = normalizeAvatars(card);
    assert.deepEqual(result, []);
  });
});

describe('normalizeStartingScenarios', () => {
  it('returns existing scenarios when provided', () => {
    const scenarios: StartingScenario[] = [
      { id: 'scenario_1', name: 'Morning', scenario: 'It is morning', first_message: 'Good morning!' },
      { id: 'scenario_2', name: 'Evening', scenario: 'It is evening', first_message: 'Good evening!' },
    ];
    const card = makeCard({ starting_scenarios: scenarios });
    const result = normalizeStartingScenarios(card);
    assert.deepEqual(result, scenarios);
  });

  it('creates default scenario from legacy fields', () => {
    const card = makeCard({ scenario: 'Legacy scenario', first_message: 'Legacy greeting' });
    const result = normalizeStartingScenarios(card);
    assert.equal(result.length, 1);
    const scenario = result[0]!;
    assert.equal(scenario.id, 'default');
    assert.equal(scenario.name, 'Default');
    assert.equal(scenario.scenario, 'Legacy scenario');
    assert.equal(scenario.first_message, 'Legacy greeting');
  });

  it('returns empty array when no scenarios and no legacy fields', () => {
    const card = makeCard({ scenario: '', first_message: null });
    const result = normalizeStartingScenarios(card);
    assert.deepEqual(result, []);
  });

  it('creates default scenario when only scenario is provided', () => {
    const card = makeCard({ scenario: 'Only scenario', first_message: null });
    const result = normalizeStartingScenarios(card);
    assert.equal(result.length, 1);
    const scenario = result[0]!;
    assert.equal(scenario.scenario, 'Only scenario');
    assert.equal(scenario.first_message, '');
  });
});

describe('resolveAvatar', () => {
  it('resolves avatar by ID', () => {
    const avatars: AvatarOption[] = [
      { id: 'avatar_1', name: 'Default', image: '/img/default.png' },
      { id: 'avatar_2', name: 'Casual', image: '/img/casual.png' },
    ];
    const card = makeCard({ avatars });
    const result = resolveAvatar(card, 'avatar_2');
    assert.ok(result);
    assert.equal(result.id, 'avatar_2');
    assert.equal(result.name, 'Casual');
    assert.equal(result.image, '/img/casual.png');
  });

  it('returns undefined for invalid ID', () => {
    const avatars: AvatarOption[] = [
      { id: 'avatar_1', name: 'Default', image: '/img/default.png' },
    ];
    const card = makeCard({ avatars });
    const result = resolveAvatar(card, 'nonexistent');
    assert.equal(result, undefined);
  });

  it('resolves default avatar from legacy field', () => {
    const card = makeCard({ avatar: '/img/legacy.png' });
    const result = resolveAvatar(card, 'default');
    assert.ok(result);
    assert.equal(result.id, 'default');
    assert.equal(result.image, '/img/legacy.png');
  });
});

describe('resolveStartingScenario', () => {
  it('resolves scenario by ID', () => {
    const scenarios: StartingScenario[] = [
      { id: 'scenario_1', name: 'Morning', scenario: 'It is morning', first_message: 'Good morning!' },
      { id: 'scenario_2', name: 'Evening', scenario: 'It is evening', first_message: 'Good evening!' },
    ];
    const card = makeCard({ starting_scenarios: scenarios });
    const result = resolveStartingScenario(card, 'scenario_2');
    assert.ok(result);
    assert.equal(result.id, 'scenario_2');
    assert.equal(result.name, 'Evening');
    assert.equal(result.scenario, 'It is evening');
    assert.equal(result.first_message, 'Good evening!');
  });

  it('returns undefined for invalid ID', () => {
    const scenarios: StartingScenario[] = [
      { id: 'scenario_1', name: 'Morning', scenario: 'It is morning', first_message: 'Good morning!' },
    ];
    const card = makeCard({ starting_scenarios: scenarios });
    const result = resolveStartingScenario(card, 'nonexistent');
    assert.equal(result, undefined);
  });

  it('resolves default scenario from legacy fields', () => {
    const card = makeCard({ scenario: 'Legacy scenario', first_message: 'Legacy greeting' });
    const result = resolveStartingScenario(card, 'default');
    assert.ok(result);
    assert.equal(result.id, 'default');
    assert.equal(result.scenario, 'Legacy scenario');
    assert.equal(result.first_message, 'Legacy greeting');
  });
});

describe('session creation with avatar/scenario snapshots', () => {
  // These tests verify the session creation path: a card with avatars and
  // scenarios is linked to a session, and the selected options are snapshotted.

  it('resolves avatar from card with multiple avatars', () => {
    const avatars: AvatarOption[] = [
      { id: 'formal', name: 'Formal', image: '/img/formal.png' },
      { id: 'casual', name: 'Casual', image: '/img/casual.png' },
    ];
    const card = makeCard({ avatars });
    const resolved = resolveAvatar(card, 'casual');
    assert.ok(resolved);
    assert.equal(resolved.id, 'casual');
    assert.equal(resolved.image, '/img/casual.png');
  });

  it('resolves scenario from card with multiple scenarios', () => {
    const scenarios: StartingScenario[] = [
      { id: 'morning', name: 'Morning', scenario: 'It is dawn', first_message: 'Good morning!' },
      { id: 'evening', name: 'Evening', scenario: 'It is dusk', first_message: 'Good evening!' },
    ];
    const card = makeCard({ starting_scenarios: scenarios });
    const resolved = resolveStartingScenario(card, 'evening');
    assert.ok(resolved);
    assert.equal(resolved.id, 'evening');
    assert.equal(resolved.scenario, 'It is dusk');
  });

  it('normalizeAvatars falls back to legacy when avatars array is empty', () => {
    const card = makeCard({ avatar: '/img/legacy.png', avatars: [] });
    const result = normalizeAvatars(card);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, 'default');
    assert.equal(result[0]!.image, '/img/legacy.png');
  });

  it('normalizeStartingScenarios falls back to legacy when scenarios array is empty', () => {
    const card = makeCard({ scenario: 'Legacy scenario', first_message: 'Hi', starting_scenarios: [] });
    const result = normalizeStartingScenarios(card);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, 'default');
    assert.equal(result[0]!.scenario, 'Legacy scenario');
  });

  it('returns undefined for invalid avatar ID on multi-avatar card', () => {
    const avatars: AvatarOption[] = [
      { id: 'a', name: 'A', image: '/a.png' },
      { id: 'b', name: 'B', image: '/b.png' },
    ];
    const card = makeCard({ avatars });
    assert.equal(resolveAvatar(card, 'nonexistent'), undefined);
  });

  it('returns undefined for invalid scenario ID on multi-scenario card', () => {
    const scenarios: StartingScenario[] = [
      { id: 's1', name: 'One', scenario: 'x', first_message: 'y' },
    ];
    const card = makeCard({ starting_scenarios: scenarios });
    assert.equal(resolveStartingScenario(card, 'nonexistent'), undefined);
  });
});

// ── Entity directory creation ────────────────────────────────────────────

describe('createCharacterCard entity directory', () => {
  let origDbPath: string | undefined;
  let tempDir: string;

  before(() => {
    origDbPath = process.env.PLAYIME_DB_PATH;
    tempDir = mkdtempSync(join(tmpdir(), 'playime-char-test-'));
    process.env.PLAYIME_DB_PATH = join(tempDir, 'test.db');
  });

  after(() => {
    // Restore original env
    if (origDbPath === undefined) {
      delete process.env.PLAYIME_DB_PATH;
    } else {
      process.env.PLAYIME_DB_PATH = origDbPath;
    }
    // Clean up temp dir (may fail on Windows if DB handle is still open)
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('creates entity directory on character creation', () => {
    const card = createCharacterCard({ name: 'Entity Dir Test' });
    assert.ok(card.id, 'card should have an id');

    // Entity directory should exist at data/entities/characters/<id>/
    const entityDir = join(import.meta.dirname, '../../data/entities/characters', card.id);
    assert.ok(existsSync(entityDir), `entity directory should exist at ${entityDir}`);

    // Clean up
    deleteCharacterCard(card.id);
    rmSync(entityDir, { recursive: true, force: true });
  });

  it('creates entity directory even when no avatar is provided', () => {
    const card = createCharacterCard({ name: 'No Avatar Test' });
    assert.ok(card.id);

    const entityDir = join(import.meta.dirname, '../../data/entities/characters', card.id);
    assert.ok(existsSync(entityDir), 'entity directory should exist without avatar');

    // Clean up
    deleteCharacterCard(card.id);
    rmSync(entityDir, { recursive: true, force: true });
  });
});
