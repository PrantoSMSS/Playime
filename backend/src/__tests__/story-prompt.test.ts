/**
 * Tests for the Story DM prompt renderer.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/story-prompt.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderStorySystemPrompt } from '../prompts/story.js';
import type { StoryCard, QuestEntry } from '../models/story.js';
import type { Persona } from '../models/persona.js';

// Helper to create a minimal StoryCard for testing
function makeStory(overrides: Partial<StoryCard> = {}): StoryCard {
  return {
    id: 'story-1',
    title: 'The Crystal Caverns',
    genre: 'Fantasy',
    premise: 'A dangerous dungeon awaits.',
    tone: 'Dark and mysterious',
    description: null,
    cover_image: null,
    locations: ['Crystal Caverns', 'Village of Thorn'],
    world_info: [],
    cast_mode: 'selectable',
    character_references: [],
    npcs: [
      { id: 'npc-1', name: 'Eldra', description: 'A wise elf guide', relationship_state: { affection: 0, trust: 50, flags: [] } },
    ],
    quest_log: [],
    starting_scenarios: [],
    plot_flags: {},
    current_scene: null,
    chapter_log: [],
    creator_name: null,
    tags: [],
    stats: { replay_count: 0, like_count: 0, comment_count: 0 },
    favorite: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function makeQuest(overrides: Partial<QuestEntry> = {}): QuestEntry {
  return {
    id: 'q-1',
    title: 'Find the Crystal',
    objective: 'Locate the ancient crystal in the caverns',
    order: 0,
    status: 'active',
    origin: 'source',
    ...overrides,
  };
}

describe('renderStorySystemPrompt', () => {
  it('renders basic story header with title and genre', () => {
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('dungeon master of "The Crystal Caverns"'));
    assert.ok(prompt.includes('Fantasy'));
  });

  it('includes premise and tone', () => {
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('## Premise'));
    assert.ok(prompt.includes('A dangerous dungeon awaits.'));
    assert.ok(prompt.includes('## Tone'));
    assert.ok(prompt.includes('Dark and mysterious'));
  });

  it('renders locations', () => {
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('Crystal Caverns'));
    assert.ok(prompt.includes('Village of Thorn'));
  });

  it('renders NPCs', () => {
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('Eldra'));
    assert.ok(prompt.includes('A wise elf guide'));
  });

  it('includes active quest as directional guidance', () => {
    const quest = makeQuest({ status: 'active' });
    const story = makeStory({ quest_log: [quest] });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('## Quest Progress'));
    assert.ok(prompt.includes('Locate the ancient crystal'));
  });

  it('does not show quest progress when no active quest', () => {
    const quest = makeQuest({ status: 'completed' });
    const story = makeStory({ quest_log: [quest] });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(!prompt.includes('## Quest Progress'));
  });

  it('shows ending hint when active quest is the ending', () => {
    const quest = makeQuest({ status: 'active', is_ending: true });
    const story = makeStory({ quest_log: [quest] });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('ending'));
  });

  it('renders plot flags', () => {
    const story = makeStory({ plot_flags: { crystal_found: true, trust_eldra: 3 } });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('crystal_found'));
    assert.ok(prompt.includes('true'));
  });

  it('shows "No plot flags set yet" when flags are empty', () => {
    const story = makeStory({ plot_flags: {} });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('No plot flags set yet.'));
  });

  it('renders chapter log', () => {
    const story = makeStory({
      chapter_log: [{ title: 'Chapter 1', summary: 'The journey begins' }],
    });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('## Story so far'));
    assert.ok(prompt.includes('Chapter 1'));
    assert.ok(prompt.includes('The journey begins'));
  });

  it('shows "None yet" for empty chapter log', () => {
    const story = makeStory({ chapter_log: [] });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('None yet.'));
  });

  it('includes narration rules', () => {
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('## Narration rules'));
    assert.ok(prompt.includes('Never break the fourth wall'));
  });

  it('uses questLogState override when provided', () => {
    const overrideQuest: QuestEntry[] = [
      { id: 'q-override', title: 'Override Quest', objective: 'Override objective', order: 0, status: 'active', origin: 'source' },
    ];
    const story = makeStory({ quest_log: [makeQuest()] });
    const prompt = renderStorySystemPrompt(story, overrideQuest);
    assert.ok(prompt.includes('Override objective'));
    assert.ok(!prompt.includes('Locate the ancient crystal'));
  });

  it('uses plotFlags override when provided', () => {
    const story = makeStory({ plot_flags: { original: true } });
    const prompt = renderStorySystemPrompt(story, undefined, { override: true });
    assert.ok(prompt.includes('override'));
    assert.ok(!prompt.includes('original'));
  });

  it('renders player persona when provided (non-myself)', () => {
    const persona: Persona = {
      id: 'p-1',
      name: 'Aria',
      avatar: null,
      avatar_file: null,
      description: 'A brave warrior',
      appearance: 'Tall with red hair',
      personality: 'Bold',
      pronouns: 'she/her',
      background: 'From a noble family',
      details: 'Likes swords',
      created_at: 0,
      updated_at: 0,
    };
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story, undefined, undefined, persona);
    assert.ok(prompt.includes('## Player Persona'));
    assert.ok(prompt.includes('Name: Aria'));
    assert.ok(prompt.includes('Pronouns: she/her'));
    assert.ok(prompt.includes('Appearance: Tall with red hair'));
  });

  it('does not render player persona for "myself"', () => {
    const persona: Persona = {
      id: 'myself',
      name: 'Myself',
      avatar: null,
      avatar_file: null,
      description: '',
      appearance: '',
      personality: '',
      pronouns: '',
      background: '',
      details: '',
      created_at: 0,
      updated_at: 0,
    };
    const story = makeStory();
    const prompt = renderStorySystemPrompt(story, undefined, undefined, persona);
    assert.ok(!prompt.includes('## Player Persona'));
  });

  it('gracefully handles empty locations and NPCs', () => {
    const story = makeStory({ locations: [], npcs: [] });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('No locations defined.'));
    assert.ok(prompt.includes('No NPCs defined.'));
  });

  it('gracefully handles missing premise and tone', () => {
    const story = makeStory({ premise: '', tone: '' });
    const prompt = renderStorySystemPrompt(story);
    assert.ok(prompt.includes('No premise provided.'));
    assert.ok(prompt.includes('No tone specified.'));
  });
});
