/**
 * Tests for prompt assembly — verifying selected starting scenario is used.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/prompt.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderCharacterSystemPrompt } from '../prompts/character.js';
import type { CharacterCard, StartingScenario } from '../models/character.js';

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
    scenario: 'Default scenario text',
    first_message: 'Hello!',
    relationship_state: { affection: 50, trust: 50, flags: [] },
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

describe('renderCharacterSystemPrompt', () => {
  it('uses card scenario when no starting scenario provided', () => {
    const card = makeCard({ scenario: 'Card default scenario' });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('## Scenario\nCard default scenario'));
  });

  it('uses starting scenario when provided', () => {
    const card = makeCard({ scenario: 'Card default scenario' });
    const startingScenario: StartingScenario = {
      id: 'scenario_1',
      name: 'Custom Scenario',
      scenario: 'Custom scenario text',
      first_message: 'Custom greeting',
    };
    const prompt = renderCharacterSystemPrompt(card, card.relationship_state, startingScenario);
    assert.ok(prompt.includes('## Scenario\nCustom scenario text'));
    assert.ok(!prompt.includes('Card default scenario'));
  });

  it('includes card name and tagline', () => {
    const card = makeCard({ name: 'Alice', tagline: 'A friendly character' });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('You are Alice. A friendly character'));
  });

  it('includes personality and speech style', () => {
    const card = makeCard({
      personality: 'Warm and kind',
      speech_style: 'Formal and polite',
    });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('## Personality\nWarm and kind'));
    assert.ok(prompt.includes('## Speech style\nFormal and polite'));
  });

  it('includes relationship state', () => {
    const card = makeCard({
      relationship_state: { affection: 75, trust: 80, flags: ['friend'] },
    });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('- Affection: 75/100'));
    assert.ok(prompt.includes('- Trust: 80/100'));
    assert.ok(prompt.includes('- Flags: friend'));
    assert.ok(prompt.includes('Close and trusting'));
  });

  it('uses default length guidance when not provided', () => {
    const card = makeCard({ length_guidance: null });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('Keep responses 1-3 sentences unless the moment calls for more'));
  });

  it('uses custom length guidance when provided', () => {
    const card = makeCard({ length_guidance: '2-4 sentences' });
    const prompt = renderCharacterSystemPrompt(card);
    assert.ok(prompt.includes('Keep responses 2-4 sentences'));
  });
});
