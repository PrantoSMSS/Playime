/**
 * Tests for persona model — CRUD and reuse across sessions.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/persona.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
  updatePersona,
  DEFAULT_PERSONA,
} from '../models/persona.js';

describe('persona CRUD', () => {
  it('creates and retrieves a persona', () => {
    const persona = createPersona({ name: 'Test Mage' });
    assert.ok(persona.id);
    assert.equal(persona.name, 'Test Mage');
    const fetched = getPersona(persona.id);
    assert.ok(fetched);
    assert.equal(fetched.id, persona.id);
    assert.equal(fetched.name, 'Test Mage');
  });

  it('lists all personas', () => {
    const before = listPersonas();
    createPersona({ name: 'List Test' });
    const after = listPersonas();
    assert.ok(after.length >= before.length);
  });

  it('updates a persona', () => {
    const persona = createPersona({ name: 'Original Name' });
    const updated = updatePersona(persona.id, { name: 'Updated Name', pronouns: 'she/her' });
    assert.ok(updated);
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.pronouns, 'she/her');
    assert.equal(updated.appearance, ''); // unchanged fields stay default
  });

  it('deletes a persona', () => {
    const persona = createPersona({ name: 'To Delete' });
    const deleted = deletePersona(persona.id);
    assert.equal(deleted, true);
    const fetched = getPersona(persona.id);
    assert.equal(fetched, undefined);
  });

  it('returns undefined for nonexistent persona', () => {
    assert.equal(getPersona('nonexistent-id'), undefined);
  });
});

describe('default persona', () => {
  it('has expected structure', () => {
    assert.equal(DEFAULT_PERSONA.name, 'Myself');
    assert.equal(DEFAULT_PERSONA.description, 'Default persona — just me');
    assert.equal(DEFAULT_PERSONA.appearance, '');
    assert.equal(DEFAULT_PERSONA.personality, '');
    assert.equal(DEFAULT_PERSONA.pronouns, '');
  });
});
