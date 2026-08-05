// backend/src/storage.ts
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// ESM-compatible dirname — import.meta.dirname is available in Node 20.11+
const CURRENT_DIR = import.meta.dirname;
const DATA_DIR = join(CURRENT_DIR, '../data');
const ENTITIES_DIR = resolve(DATA_DIR, 'entities');

export const ENTITY_TYPES = ['characters', 'personas', 'stories'] as const;
export type EntityType = typeof ENTITY_TYPES[number];

/**
 * Ensure entity type base directory exists.
 */
export function ensureTypeDir(type: EntityType): void {
  mkdirSync(join(ENTITIES_DIR, type), { recursive: true });
}

/**
 * Ensure entity folder exists and return its path.
 * Creates both type directory and entity folder if missing.
 */
export function ensureEntityDir(type: EntityType, id: string): string {
  ensureTypeDir(type);
  const dir = join(ENTITIES_DIR, type, id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get absolute path to an entity file.
 * Returns null if path would escape entities directory (traversal guard).
 */
export function getEntityPath(type: EntityType, id: string, filename: string): string | null {
  // Resolve to absolute canonical path first — this resolves any `..` sequences
  const filePath = resolve(join(ENTITIES_DIR, type, id, filename));

  // Path traversal guard: resolved path must be strictly inside ENTITIES_DIR
  // Using resolve() ensures `..` is expanded before comparison
  // Use path separator (not hardcoded '/') for cross-platform correctness
  if (!filePath.startsWith(ENTITIES_DIR + sep) && filePath !== ENTITIES_DIR) {
    return null;
  }

  return filePath;
}

/**
 * Delete entire entity folder (recursive, force).
 * Used on card/persona/story deletion for cascade cleanup.
 */
export function deleteEntityDir(type: EntityType, id: string): void {
  const dir = join(ENTITIES_DIR, type, id);
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Ensure base entity directories exist on startup.
 */
export function initializeStorage(): void {
  for (const type of ENTITY_TYPES) {
    ensureTypeDir(type);
  }
}
