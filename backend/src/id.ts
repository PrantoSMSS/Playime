/**
 * Structured ID allocator for Playime entities.
 *
 * Format: type_slug_sequence (e.g. char_yehwa_0001)
 * Sequences are per-slug for named entities, global for sessions/messages.
 * IDs are never reused after successful creation — gaps from deletions are acceptable.
 *
 * IMPORTANT: allocateId() does NOT manage transactions.
 * The caller (model) must wrap it in BEGIN/COMMIT with try/catch/ROLLBACK.
 * allocateId() MUST never be called outside a transaction.
 */
import type { DatabaseSync } from 'node:sqlite';

export type EntityType = 'char' | 'story' | 'persona' | 'sess' | 'msg';

/**
 * Convert a name to a URL-safe slug.
 * "Yehwa's Tale" → "yehwas-tale"
 * "MountainTrial" → "mountaintrial"
 * "!!!" → "" (empty — allocateId will reject this for named entities)
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Allocate the next ID for an entity type/slug.
 *
 * Named entities (char, story, persona): type_slug_XXXX
 * Sessions/messages: type_XXXXXXX (no slug)
 *
 * Uses the id_sequences table. The caller MUST be inside a transaction.
 * This function does NOT begin or commit a transaction.
 *
 * Throws if:
 * - Named entity type produces an empty slug
 * - Sequence row lookup fails after upsert (should never happen)
 */
export function allocateId(
  db: DatabaseSync,
  type: EntityType,
  name?: string
): string {
  const slug = name ? toSlug(name) : '';

  // Reject empty slugs for named entity types
  if (!slug && type !== 'sess' && type !== 'msg') {
    throw new Error(
      `Cannot generate structured ID: "${name}" produces an empty slug`
    );
  }

  const prefix = slug ? `${type}_${slug}_` : `${type}_`;
  const padding = type === 'sess' || type === 'msg' ? 7 : 4;

  // Upsert: insert with next_seq=2 if new (1 consumed immediately),
  // or increment existing counter
  db.prepare(
    `INSERT INTO id_sequences (type, slug, next_seq) VALUES (?, ?, 2)
     ON CONFLICT (type, slug) DO UPDATE SET next_seq = next_seq + 1`
  ).run(type, slug);

  // Read the value AFTER increment — defensive check
  const row = db.prepare(
    `SELECT next_seq FROM id_sequences WHERE type = ? AND slug = ?`
  ).get(type, slug) as { next_seq: number } | undefined;

  if (!row) {
    throw new Error(`Failed to allocate ID sequence for ${type}:${slug}`);
  }

  // Allocated number is next_seq - 1
  let seq = row.next_seq - 1;
  let padded = seq.toString().padStart(padding, '0');
  let candidate = `${prefix}${padded}`;

  // Safety net: if the generated ID already exists (e.g. from legacy seed data
  // that wasn't parsed by reserveExistingIdSequences), keep incrementing until
  // we find an unused one. This is rare — only happens during migration of
  // databases with non-structured IDs.
  const checkExists = db.prepare(`SELECT 1 FROM ${type === 'char' ? 'character_card' : type === 'persona' ? 'persona' : type === 'sess' ? 'session' : 'message'} WHERE id = ?`);
  while (checkExists.get(candidate)) {
    db.prepare(
      `INSERT INTO id_sequences (type, slug, next_seq) VALUES (?, ?, ?)
       ON CONFLICT (type, slug) DO UPDATE SET next_seq = next_seq + 1`
    ).run(type, slug, seq + 2);
    const rerow = db.prepare(
      `SELECT next_seq FROM id_sequences WHERE type = ? AND slug = ?`
    ).get(type, slug) as { next_seq: number };
    seq = rerow.next_seq - 1;
    padded = seq.toString().padStart(padding, '0');
    candidate = `${prefix}${padded}`;
  }

  return candidate;
}
