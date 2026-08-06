/**
 * Tests for persona model — CRUD, entity storage, and reuse across sessions.
 *
 * Uses Node's built-in test runner (node:test).
 * Run with: node --import tsx --test src/__tests__/persona.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createPersona,
  countSessionsForPersona,
  deletePersona,
  getPersona,
  listPersonas,
  updatePersona,
  DEFAULT_PERSONA,
} from '../models/persona.js';
import { getDb } from '../db.js';

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

  it('persists and returns avatar_file on create', () => {
    const persona = createPersona({ name: 'Avatar Test', avatar_file: 'avatar.png' });
    assert.equal(persona.avatar_file, `personas/${persona.id}/avatar.png`);
    const fetched = getPersona(persona.id);
    assert.ok(fetched);
    assert.equal(fetched.avatar_file, `personas/${persona.id}/avatar.png`);
  });

  it('round-trips avatar_file on update', () => {
    const persona = createPersona({ name: 'Avatar Update' });
    assert.equal(persona.avatar_file, null);
    const updated = updatePersona(persona.id, { avatar_file: 'profile.jpg' });
    assert.ok(updated);
    assert.equal(updated.avatar_file, `personas/${persona.id}/profile.jpg`);
  });

  it('returns null avatar_file when not set', () => {
    const persona = createPersona({ name: 'No Avatar File' });
    assert.equal(persona.avatar_file, null);
  });

  it('counts sessions referencing a persona', () => {
    const persona = createPersona({ name: 'Session Count Test' });
    assert.equal(countSessionsForPersona(persona.id), 0);

    // Insert a session referencing this persona
    const db = getDb();
    const sessId = `sess_test_${Date.now()}`;
    db.prepare(
      `INSERT INTO session (id, class, created_at, provider, persona_id) VALUES (?, 'character', ?, 'opencode', ?)`,
    ).run(sessId, Date.now(), persona.id);

    assert.equal(countSessionsForPersona(persona.id), 1);

    // Clean up
    db.prepare('DELETE FROM session WHERE id = ?').run(sessId);
    deletePersona(persona.id);
    assert.equal(countSessionsForPersona(persona.id), 0);
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

// ── Entity directory creation ────────────────────────────────────────────

describe('createPersona entity directory', () => {
  let origDbPath: string | undefined;
  let tempDir: string;

  before(() => {
    origDbPath = process.env.PLAYIME_DB_PATH;
    tempDir = mkdtempSync(join(tmpdir(), 'playime-persona-test-'));
    process.env.PLAYIME_DB_PATH = join(tempDir, 'test.db');
  });

  after(() => {
    if (origDbPath === undefined) {
      delete process.env.PLAYIME_DB_PATH;
    } else {
      process.env.PLAYIME_DB_PATH = origDbPath;
    }
    // Clean up temp dir (may fail on Windows if DB handle is still open)
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('creates entity directory on persona creation', () => {
    const persona = createPersona({ name: 'Entity Dir Persona' });
    assert.ok(persona.id, 'persona should have an id');

    const entityDir = join(import.meta.dirname, '../../data/entities/personas', persona.id);
    assert.ok(existsSync(entityDir), `entity directory should exist at ${entityDir}`);

    // Clean up
    deletePersona(persona.id);
    rmSync(entityDir, { recursive: true, force: true });
  });

  it('creates entity directory even without avatar', () => {
    const persona = createPersona({ name: 'No Avatar Persona' });
    assert.ok(persona.id);

    const entityDir = join(import.meta.dirname, '../../data/entities/personas', persona.id);
    assert.ok(existsSync(entityDir), 'entity directory should exist without avatar');

    // Clean up
    deletePersona(persona.id);
    rmSync(entityDir, { recursive: true, force: true });
  });
});
