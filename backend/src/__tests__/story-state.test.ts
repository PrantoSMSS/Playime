/**
 * Tests for story state extraction and quest advancement.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/story-state.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceQuest, evaluateTriggersOn } from '../story-state.js';
import type { QuestEntry } from '../models/story.js';
import type { StoryStateResult } from '../story-state.js';

// ── Helper builders ────────────────────────────────────────────────────

function makeQuest(overrides: Partial<QuestEntry> = {}): QuestEntry {
  return {
    id: 'q-1',
    title: 'Quest One',
    objective: 'Do the thing',
    order: 0,
    status: 'pending',
    origin: 'source',
    ...overrides,
  };
}

// ── advanceQuest ───────────────────────────────────────────────────────

describe('advanceQuest', () => {
  it('does nothing when quest_status is unchanged', () => {
    const log = [
      makeQuest({ id: 'q-1', order: 0, status: 'active' }),
      makeQuest({ id: 'q-2', order: 1, status: 'pending' }),
    ];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'unchanged',
      next_quest_id: null,
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.deepEqual(updated, log);
  });

  it('marks active quest as completed and activates next quest', () => {
    const log = [
      makeQuest({ id: 'q-1', order: 0, status: 'active' }),
      makeQuest({ id: 'q-2', order: 1, status: 'pending' }),
    ];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: 'q-2',
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.equal(updated[0]!.status, 'completed');
    assert.equal(updated[1]!.status, 'active');
  });

  it('marks active quest as failed and activates next quest', () => {
    const log = [
      makeQuest({ id: 'q-1', order: 0, status: 'active' }),
      makeQuest({ id: 'q-2', order: 1, status: 'pending' }),
    ];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'failed',
      next_quest_id: 'q-2',
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.equal(updated[0]!.status, 'failed');
    assert.equal(updated[1]!.status, 'active');
  });

  it('completes active quest without activating a next quest', () => {
    const log = [
      makeQuest({ id: 'q-1', order: 0, status: 'active' }),
    ];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: null,
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.equal(updated[0]!.status, 'completed');
  });

  it('does not touch unrelated quests', () => {
    const log = [
      makeQuest({ id: 'q-1', order: 0, status: 'active' }),
      makeQuest({ id: 'q-2', order: 1, status: 'pending' }),
      makeQuest({ id: 'q-3', order: 2, status: 'pending' }),
    ];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'completed',
      next_quest_id: 'q-3',
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.equal(updated[0]!.status, 'completed');
    assert.equal(updated[1]!.status, 'pending');
    assert.equal(updated[2]!.status, 'active');
  });

  it('returns same array reference when unchanged', () => {
    const log = [makeQuest({ id: 'q-1', order: 0, status: 'active' })];
    const result: StoryStateResult = {
      plot_flags: {},
      quest_status: 'unchanged',
      next_quest_id: null,
      memory_note: '',
    };
    const updated = advanceQuest(log, result);
    assert.equal(updated, log);
  });
});

// ── evaluateTriggersOn ─────────────────────────────────────────────────

describe('evaluateTriggersOn', () => {
  it('returns true when no triggers_on conditions', () => {
    const quest = makeQuest({});
    assert.equal(evaluateTriggersOn(quest, {}), true);
  });

  it('returns true when triggers_on is empty array', () => {
    const quest = makeQuest({ triggers_on: [] });
    assert.equal(evaluateTriggersOn(quest, {}), true);
  });

  it('returns true when eq condition is met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'met_eldra', op: 'eq', value: true }],
    });
    assert.equal(evaluateTriggersOn(quest, { met_eldra: true }), true);
  });

  it('returns false when eq condition is not met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'met_eldra', op: 'eq', value: true }],
    });
    assert.equal(evaluateTriggersOn(quest, { met_eldra: false }), false);
  });

  it('returns false when flag is missing', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'met_eldra', op: 'eq', value: true }],
    });
    assert.equal(evaluateTriggersOn(quest, {}), false);
  });

  it('returns true when gte condition is met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'trust', op: 'gte', value: 50 }],
    });
    assert.equal(evaluateTriggersOn(quest, { trust: 75 }), true);
    assert.equal(evaluateTriggersOn(quest, { trust: 50 }), true);
  });

  it('returns false when gte condition is not met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'trust', op: 'gte', value: 50 }],
    });
    assert.equal(evaluateTriggersOn(quest, { trust: 30 }), false);
  });

  it('returns true when lte condition is met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'danger', op: 'lte', value: 10 }],
    });
    assert.equal(evaluateTriggersOn(quest, { danger: 5 }), true);
    assert.equal(evaluateTriggersOn(quest, { danger: 10 }), true);
  });

  it('returns false when lte condition is not met', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'danger', op: 'lte', value: 10 }],
    });
    assert.equal(evaluateTriggersOn(quest, { danger: 20 }), false);
  });

  it('uses AND logic for multiple conditions', () => {
    const quest = makeQuest({
      triggers_on: [
        { flag: 'met_eldra', op: 'eq', value: true },
        { flag: 'trust', op: 'gte', value: 50 },
      ],
    });
    // Both met
    assert.equal(evaluateTriggersOn(quest, { met_eldra: true, trust: 75 }), true);
    // Only first met
    assert.equal(evaluateTriggersOn(quest, { met_eldra: true, trust: 30 }), false);
    // Only second met
    assert.equal(evaluateTriggersOn(quest, { trust: 75 }), false);
    // Neither met
    assert.equal(evaluateTriggersOn(quest, {}), false);
  });

  it('handles non-number types gracefully for gte/lte', () => {
    const quest = makeQuest({
      triggers_on: [{ flag: 'status', op: 'gte', value: 50 }],
    });
    // String value should fail the type check
    assert.equal(evaluateTriggersOn(quest, { status: 'high' }), false);
  });
});
