// backend/src/storage.ts
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(__dirname, '../data');
const ENTITIES_DIR = join(DATA_DIR, 'entities');

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
  const dir = join(ENTITIES_DIR, type, id);
  const filePath = join(dir, filename);

  // Path traversal guard
  if (!filePath.startsWith(ENTITIES_DIR)) {
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
