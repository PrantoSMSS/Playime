/**
 * Story state branching test — verifies that player choices produce
 * measurably different narrative paths via plot_flags and quest progression.
 *
 * Uses node:test + node:assert/strict. Run with: node --import tsx --test src/story-state.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceQuest, evaluateTriggersOn } from './story-state.js';
import type { QuestEntry } from './models/story.js';
import type { StoryStateResult } from './story-state.js';

// ── Test fixtures ──────────────────────────────────────────────────────

const QUEST_CHAIN: QuestEntry[] = [
  {
    id: 'q1',
    title: 'Find the Artifact',
    objective: 'Locate the ancient artifact in the ruins',
    order: 1,
    status: 'active',
    origin: 'main',
  },
  {
    id: 'q2',
    title: 'Defend the Village',
    objective: 'Protect the village from bandits',
    order: 2,
    status: 'pending',
    origin: 'main',
  },
  {
    id: 'q3',
    title: 'Betray the Village',
    objective: 'Side with the bandits and betray the village',
    order: 3,
    status: 'pending',
    origin: 'branch',
    triggers_on: [
      { flag: 'betrayed_village', op: 'eq', value: true },
    ],
  },
  {
    id: 'q4',
    title: 'Hero\'s Reward',
    objective: 'Receive the village\'s gratitude',
    order: 4,
    status: 'pending',
    origin: 'main',
    triggers_on: [
      { flag: 'betrayed_village', op: 'eq', value: false },
    ],
  },
];

// ── advanceQuest tests ─────────────────────────────────────────────────

describe('advanceQuest', () => {
  it('does not mutate the original quest log', () => {
    const original = [...QUEST_CHAIN];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: 'q2',
      memory_note: '',
    };
    advanceQuest(QUEST_CHAIN, result);
    assert.deepStrictEqual(QUEST_CHAIN, original);
  });

  it('marks the active quest as completed and activates next', () => {
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: 'q2',
      memory_note: '',
    };
    const updated = advanceQuest(QUEST_CHAIN, result);

    assert.equal(updated[0]!.status, 'completed', 'q1 should be completed');
    assert.equal(updated[1]!.status, 'active', 'q2 should be activated');
    assert.equal(updated[2]!.status, 'pending', 'q3 should remain pending');
    assert.equal(updated[3]!.status, 'pending', 'q4 should remain pending');
  });

  it('marks the active quest as failed', () => {
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'failed',
      next_quest_id: 'q2',
      memory_note: '',
    };
    const updated = advanceQuest(QUEST_CHAIN, result);

    assert.equal(updated[0]!.status, 'failed', 'q1 should be failed');
    assert.equal(updated[1]!.status, 'active', 'q2 should be activated');
  });

  it('returns the same array reference when status is unchanged', () => {
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'unchanged',
      next_quest_id: null,
      memory_note: '',
    };
    const updated = advanceQuest(QUEST_CHAIN, result);
    assert.equal(updated, QUEST_CHAIN, 'should return the same array reference');
  });

  it('does not activate a next quest when next_quest_id is null', () => {
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: null,
      memory_note: '',
    };
    const updated = advanceQuest(QUEST_CHAIN, result);

    assert.equal(updated[0]!.status, 'completed');
    assert.equal(updated[1]!.status, 'pending', 'q2 should remain pending');
  });
});

// ── evaluateTriggersOn tests ───────────────────────────────────────────

describe('evaluateTriggersOn', () => {
  it('returns true when no triggers are defined', () => {
    const quest: QuestEntry = {
      id: 'q1', title: 'Test', objective: 'Test', order: 1,
      status: 'pending', origin: 'test',
    };
    assert.equal(evaluateTriggersOn(quest, {}), true);
  });

  it('returns true when all conditions are met', () => {
    const quest: QuestEntry = {
      id: 'q3', title: 'Betray', objective: 'Betray', order: 3,
      status: 'pending', origin: 'branch',
      triggers_on: [{ flag: 'betrayed_village', op: 'eq', value: true }],
    };
    assert.equal(evaluateTriggersOn(quest, { betrayed_village: true }), true);
  });

  it('returns false when a condition is not met', () => {
    const quest: QuestEntry = {
      id: 'q3', title: 'Betray', objective: 'Betray', order: 3,
      status: 'pending', origin: 'branch',
      triggers_on: [{ flag: 'betrayed_village', op: 'eq', value: true }],
    };
    assert.equal(evaluateTriggersOn(quest, { betrayed_village: false }), false);
  });

  it('returns false when the flag is missing', () => {
    const quest: QuestEntry = {
      id: 'q3', title: 'Betray', objective: 'Betray', order: 3,
      status: 'pending', origin: 'branch',
      triggers_on: [{ flag: 'betrayed_village', op: 'eq', value: true }],
    };
    assert.equal(evaluateTriggersOn(quest, {}), false);
  });

  it('evaluates gte correctly', () => {
    const quest: QuestEntry = {
      id: 'q5', title: 'Reputation', objective: 'Gain rep', order: 5,
      status: 'pending', origin: 'main',
      triggers_on: [{ flag: 'reputation', op: 'gte', value: 10 }],
    };
    assert.equal(evaluateTriggersOn(quest, { reputation: 15 }), true);
    assert.equal(evaluateTriggersOn(quest, { reputation: 10 }), true);
    assert.equal(evaluateTriggersOn(quest, { reputation: 5 }), false);
  });

  it('evaluates lte correctly', () => {
    const quest: QuestEntry = {
      id: 'q6', title: 'Stealth', objective: 'Stay hidden', order: 6,
      status: 'pending', origin: 'main',
      triggers_on: [{ flag: 'alert_level', op: 'lte', value: 3 }],
    };
    assert.equal(evaluateTriggersOn(quest, { alert_level: 2 }), true);
    assert.equal(evaluateTriggersOn(quest, { alert_level: 3 }), true);
    assert.equal(evaluateTriggersOn(quest, { alert_level: 5 }), false);
  });

  it('evaluates multiple conditions with AND logic', () => {
    const quest: QuestEntry = {
      id: 'q7', title: 'Complex', objective: 'Complex', order: 7,
      status: 'pending', origin: 'main',
      triggers_on: [
        { flag: 'has_key', op: 'eq', value: true },
        { flag: 'door_unlocked', op: 'eq', value: true },
      ],
    };
    assert.equal(evaluateTriggersOn(quest, { has_key: true, door_unlocked: true }), true);
    assert.equal(evaluateTriggersOn(quest, { has_key: true, door_unlocked: false }), false);
    assert.equal(evaluateTriggersOn(quest, { has_key: false, door_unlocked: true }), false);
  });
});

// ── Branching scenario tests ───────────────────────────────────────────

describe('branching: player choice determines quest path', () => {
  it('path A: player helps village → Hero\'s Reward quest activates', () => {
    // Simulate: player helped village, so betrayed_village = false
    const plotFlags = { betrayed_village: false };

    // After q1 completes, the extraction sets next_quest_id = 'q2'
    const afterQ1 = advanceQuest(QUEST_CHAIN, {
      plot_flags: plotFlags,
      quest_status: 'completed',
      next_quest_id: 'q2',
      memory_note: '',
    });

    assert.equal(afterQ1[0]!.status, 'completed');
    assert.equal(afterQ1[1]!.status, 'active');

    // After q2 completes, extraction checks triggers_on for q3 and q4
    // q3 requires betrayed_village=true → fails
    // q4 requires betrayed_village=false → passes
    assert.equal(evaluateTriggersOn(QUEST_CHAIN[2]!, plotFlags), false, 'q3 (Betray) should not trigger');
    assert.equal(evaluateTriggersOn(QUEST_CHAIN[3]!, plotFlags), true, 'q4 (Hero\'s Reward) should trigger');
  });

  it('path B: player betrays village → Betray the Village quest activates', () => {
    // Simulate: player betrayed village, so betrayed_village = true
    const plotFlags = { betrayed_village: true };

    // After q2 completes, extraction checks triggers_on
    assert.equal(evaluateTriggersOn(QUEST_CHAIN[2]!, plotFlags), true, 'q3 (Betray) should trigger');
    assert.equal(evaluateTriggersOn(QUEST_CHAIN[3]!, plotFlags), false, 'q4 (Hero\'s Reward) should not trigger');
  });

  it('different plot_flags produce different active quests from the same chain', () => {
    // Path A: helped village
    const flagsA = { betrayed_village: false };
    const eligibleA = QUEST_CHAIN.filter((q) => evaluateTriggersOn(q, flagsA));

    // Path B: betrayed village
    const flagsB = { betrayed_village: true };
    const eligibleB = QUEST_CHAIN.filter((q) => evaluateTriggersOn(q, flagsB));

    // The eligible quests should be different
    const idsA = eligibleA.map((q) => q.id);
    const idsB = eligibleB.map((q) => q.id);

    assert.ok(!idsA.includes('q3'), 'Path A should not include Betray quest');
    assert.ok(idsA.includes('q4'), 'Path A should include Hero\'s Reward');
    assert.ok(idsB.includes('q3'), 'Path B should include Betray quest');
    assert.ok(!idsB.includes('q4'), 'Path B should not include Hero\'s Reward');

    // The two paths should produce different quest sets
    assert.notDeepStrictEqual(idsA, idsB, 'Different choices should produce different quest eligibility');
  });
});
