/**
 * Tests for character card model — avatars and starting scenarios.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/character.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAvatars,
  normalizeStartingScenarios,
  resolveAvatar,
  resolveStartingScenario,
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
