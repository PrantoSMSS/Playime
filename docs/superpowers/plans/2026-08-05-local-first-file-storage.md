# Local-First File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store all entity assets (avatars, covers, gallery images) as local files on disk, eliminating external URL dependencies for complete offline operation.

**Architecture:** Entity-scoped folders under `backend/data/entities/{type}/{id}/` with `@fastify/static` serving files. DB stores relative paths instead of URLs. Cascade cleanup removes entity folders on deletion.

**Tech Stack:** Node.js, Fastify, `@fastify/static`, SQLite, SvelteKit

## Global Constraints

- TypeScript throughout backend; no implicit `any` on route boundaries.
- Single local user for v1 — no auth/multi-tenancy work.
- All state-mutating LLM calls prefer configurable "small model".
- Keep existing SillyTavern V2/V3 import/export working.
- Record design decisions in `docs/PLAYIME_CHECKLIST.md` Notes/decisions log.

---

## File Structure

### Backend (new/modified)

| File | Responsibility |
|------|----------------|
| `backend/src/storage.ts` | **NEW** — File storage utilities (ensureEntityDir, deleteEntityDir, getEntityPath) |
| `backend/src/routes/files.ts` | **NEW** — Static file serving + upload endpoints |
| `backend/src/index.ts` | Register `@fastify/static` and files route |
| `backend/db/schema.sql` | Add `avatar_file`, `cover_file` columns |
| `backend/src/models/character.ts` | Update to handle file paths, add lazy migration |
| `backend/src/routes/character.ts` | Update import/create to save avatars locally |
| `backend/src/models/persona.ts` | Update to handle file paths |
| `backend/src/routes/persona.ts` | Update create to save avatars locally |
| `backend/src/cards/sillytavern.ts` | Update import to download external avatars |

### Frontend (modified)

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/api/chat.ts` | Add `resolveFileUrl()` helper, update export functions |
| `frontend/src/lib/components/chat/CharacterGrid.svelte` | Resolve avatar paths |
| `frontend/src/lib/components/chat/CardInfoModal.svelte` | Resolve avatar paths |
| `frontend/src/lib/components/chat/ChatsList.svelte` | Resolve avatar paths |
| `frontend/src/lib/components/chat/MessageList.svelte` | Resolve avatar paths |
| `frontend/src/lib/data/sample.ts` | Remove external URLs or use local paths |

---

### Task 1: Install `@fastify/static` and create storage utilities

**Files:**
- Create: `backend/src/storage.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `ensureEntityDir(type, id)`, `deleteEntityDir(type, id)`, `getEntityPath(type, id, filename)`, `ENTITY_TYPES`

- [ ] **Step 1: Install dependency**

Run: `cd backend && npm i @fastify/static`

- [ ] **Step 2: Create storage.ts with utility functions**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add package.json package-lock.json src/storage.ts && git commit -m "chore: add @fastify/static and storage utilities"
```

---

### Task 2: Add static file serving route

**Files:**
- Create: `backend/src/routes/files.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `ensureEntityDir`, `getEntityPath`, `ENTITY_TYPES` from `storage.ts`
- Produces: `GET /api/files/:type/:id/:filename` route

- [ ] **Step 1: Create files.ts route**

```typescript
// backend/src/routes/files.ts
import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { accessSync } from 'node:fs';
import { ENTITY_TYPES, type EntityType, getEntityPath } from '../storage';

const ENTITIES_DIR = join(__dirname, '../../data/entities');

export default async function filesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/files/:type/:id/:filename
   * Serve entity files (avatars, gallery images, etc.)
   */
  app.get<{
    Params: { type: string; id: string; filename: string; '*': string };
  }>('/api/files/:type/:id/:filename/*', async (request, reply) => {
    const { type, id } = request.params;
    const filename = request.params.filename + (request.params['*'] ? '/' + request.params['*'] : '');

    // Validate entity type
    if (!ENTITY_TYPES.includes(type as EntityType)) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'Invalid entity type' },
      });
    }

    const filePath = getEntityPath(type as EntityType, id, filename);
    if (!filePath) {
      return reply.code(403).send({
        error: { code: 'forbidden', message: 'Invalid path' },
      });
    }

    // Check file exists
    try {
      accessSync(filePath);
    } catch {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'File not found' },
      });
    }

    return reply.sendFile(filename, join(ENTITIES_DIR, type, id));
  });
}
```

- [ ] **Step 2: Register route in index.ts**

Add after existing route registrations:

```typescript
import filesRoutes from './routes/files';
// ... after other app.register() calls
await app.register(filesRoutes);
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/routes/files.ts src/index.ts && git commit -m "feat: add static file serving route"
```

---

### Task 3: Update database schema

**Files:**
- Modify: `backend/db/schema.sql`
- Create: `backend/db/migrations/2026-08-05-add-avatar-file-columns.sql`

**Interfaces:**
- Produces: Schema with `avatar_file`, `cover_file` columns

- [ ] **Step 1: Create migration file**

```sql
-- backend/db/migrations/2026-08-05-add-avatar-file-columns.sql
-- Add avatar_file and cover_file columns for local file storage

ALTER TABLE character_card ADD COLUMN avatar_file TEXT;
ALTER TABLE character_card ADD COLUMN cover_file TEXT;

ALTER TABLE persona ADD COLUMN avatar_file TEXT;
```

- [ ] **Step 2: Update schema.sql**

Add new columns to character_card and persona tables:

```sql
-- In character_card table, after avatar column:
avatar_file      TEXT,                               -- local filename (e.g. "avatar.png")

-- In character_card table, after cover_image column:
cover_file       TEXT,                               -- local filename for cover

-- In persona table, after avatar column:
avatar_file      TEXT,                               -- local filename (e.g. "avatar.png")
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add db/schema.sql db/migrations/ && git commit -m "feat: add avatar_file and cover_file columns"
```

---

### Task 4: Update character model for file paths

**Files:**
- Modify: `backend/src/models/character.ts`

**Interfaces:**
- Consumes: `ensureEntityDir`, `getEntityPath` from `storage.ts`
- Produces: Updated `CharacterCard` type with `avatar_file`, `cover_file`

- [ ] **Step 1: Update CharacterCard type**

Add to the interface:

```typescript
export interface CharacterCard {
  // ... existing fields
  avatar_file: string | null;
  cover_file: string | null;
  // ... rest of fields
}
```

- [ ] **Step 2: Update cardFromRow to include new fields**

```typescript
function cardFromRow(row: any): CharacterCard {
  return {
    // ... existing mappings
    avatar_file: row.avatar_file ?? null,
    cover_file: row.cover_file ?? null,
    // ... rest
  };
}
```

- [ ] **Step 3: Update createCard and updateCard to handle file paths**

Add file path parameters to create/update functions and save to DB.

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/models/character.ts && git commit -m "feat: update character model for file paths"
```

---

### Task 5: Add file upload endpoint

**Files:**
- Modify: `backend/src/routes/files.ts`

**Interfaces:**
- Consumes: `ensureEntityDir` from `storage.ts`
- Produces: `POST /api/upload/:type/:id` route

- [ ] **Step 1: Add upload route to files.ts**

```typescript
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

/**
 * POST /api/upload/:type/:id
 * Upload file to entity folder
 */
app.post<{
  Params: { type: string; id: string };
  Body: { file: any };
}>('/api/upload/:type/:id', async (request, reply) => {
  const { type, id } = request.params;

  if (!ENTITY_TYPES.includes(type as EntityType)) {
    return reply.code(400).send({
      error: { code: 'invalid_type', message: 'Invalid entity type' },
    });
  }

  const data = await request.file();
  if (!data) {
    return reply.code(400).send({
      error: { code: 'no_file', message: 'No file uploaded' },
    });
  }

  const entityDir = ensureEntityDir(type as EntityType, id);
  const ext = data.filename.split('.').pop() || 'png';
  const filename = `avatar.${ext}`;
  const filePath = join(entityDir, filename);

  const writeStream = createWriteStream(filePath);
  await pipeline(data.file, writeStream);

  const relativePath = `${type}/${id}/${filename}`;

  return { filename, path: relativePath };
});
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add src/routes/files.ts && git commit -m "feat: add file upload endpoint"
```

---

### Task 6: Update card import to save avatars locally

**Files:**
- Modify: `backend/src/cards/sillytavern.ts`
- Modify: `backend/src/routes/character.ts`

**Interfaces:**
- Consumes: `ensureEntityDir` from `storage.ts`
- Produces: Import handler that downloads/saves external avatars

- [ ] **Step 1: Add avatar download helper to sillytavern.ts**

```typescript
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureEntityDir } from '../storage';

/**
 * Download or decode avatar and save to entity folder.
 * Returns local filename.
 */
export async function saveAvatarLocally(
  cardId: string,
  avatarValue: string | null
): Promise<string | null> {
  if (!avatarValue) return null;

  const entityDir = ensureEntityDir('characters', cardId);

  if (avatarValue.startsWith('data:')) {
    // Decode base64 data URI
    const base64 = avatarValue.split(',')[1] ?? '';
    const buffer = Buffer.from(base64, 'base64');
    const ext = avatarValue.includes('image/png') ? 'png' : 'jpg';
    const filename = `avatar.${ext}`;
    writeFileSync(join(entityDir, filename), buffer);
    return filename;
  }

  if (avatarValue.startsWith('http://') || avatarValue.startsWith('https://')) {
    // Fetch from URL
    const resp = await fetch(avatarValue);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || '';
    const ext = contentType.includes('image/png') ? 'png' : 'jpg';
    const filename = `avatar.${ext}`;
    writeFileSync(join(entityDir, filename), buffer);
    return filename;
  }

  // Already a relative path or unknown format
  return null;
}
```

- [ ] **Step 2: Update import handler in character.ts to use saveAvatarLocally**

After parsing the card, call `saveAvatarLocally` and update `card.avatar_file`.

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/cards/sillytavern.ts src/routes/character.ts && git commit -m "feat: save avatars locally on import"
```

---

### Task 7: Add cascade cleanup on entity deletion

**Files:**
- Modify: `backend/src/routes/character.ts`
- Modify: `backend/src/routes/persona.ts`

**Interfaces:**
- Consumes: `deleteEntityDir` from `storage.ts`

- [ ] **Step 1: Update character DELETE route**

```typescript
import { deleteEntityDir } from '../storage';

// In DELETE /api/cards/:id handler, after DB delete:
deleteEntityDir('characters', id);
```

- [ ] **Step 2: Update persona DELETE route**

```typescript
import { deleteEntityDir } from '../storage';

// In DELETE /api/personas/:id handler, after DB delete:
deleteEntityDir('personas', id);
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/routes/character.ts src/routes/persona.ts && git commit -m "feat: cascade delete entity folders"
```

---

### Task 8: Update frontend API client

**Files:**
- Modify: `frontend/src/lib/api/chat.ts`

**Interfaces:**
- Produces: `resolveFileUrl(path)` helper function

- [ ] **Step 1: Add resolveFileUrl helper**

```typescript
/**
 * Resolve a relative file path to a full URL.
 * Handles both old URL format and new relative path format.
 */
export function resolveFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path; // Already a full URL
  }
  return `${BASE}/api/files/${path}`;
}
```

- [ ] **Step 2: Update exportCardAsPng to use resolveFileUrl**

```typescript
export async function exportCardAsPng(card: ApiCharacterCard): Promise<void> {
  const avatarPath = card.avatars[0]?.image ?? card.avatar_file;
  const avatarUrl = resolveFileUrl(avatarPath);

  if (!avatarUrl) {
    throw new ApiError(400, 'no_avatar', 'Card has no avatar image to embed');
  }

  // Fetch from local file server
  const res = await fetch(avatarUrl);
  // ... rest of export logic
}
```

- [ ] **Step 3: Update ApiCharacterCard type**

```typescript
export interface ApiCharacterCard {
  // ... existing fields
  avatar_file: string | null;
  cover_file: string | null;
  // ... rest
}
```

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/lib/api/chat.ts && git commit -m "feat: add resolveFileUrl helper"
```

---

### Task 9: Update frontend components to resolve avatar paths

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterGrid.svelte`
- Modify: `frontend/src/lib/components/chat/CardInfoModal.svelte`
- Modify: `frontend/src/lib/components/chat/ChatsList.svelte`

**Interfaces:**
- Consumes: `resolveFileUrl` from `api/chat.ts`

- [ ] **Step 1: Update CharacterGrid.svelte**

Replace:
```svelte
<img src={card.avatar} alt={card.name} />
```

With:
```svelte
<img src={resolveFileUrl(card.avatar_file ?? card.avatar)} alt={card.name} />
```

- [ ] **Step 2: Update CardInfoModal.svelte**

Apply same pattern for avatar display.

- [ ] **Step 3: Update ChatsList.svelte**

Apply same pattern for session avatars.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/lib/components/chat/ && git commit -m "feat: resolve avatar paths in components"
```

---

### Task 10: Update sample data

**Files:**
- Modify: `frontend/src/lib/data/sample.ts`

**Interfaces:**
- Produces: Sample data with local paths or removed external URLs

- [ ] **Step 1: Remove or replace external URLs**

Option A: Remove sample sessions entirely (they reference backend data).
Option B: Use placeholder local paths.

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/lib/data/sample.ts && git commit -m "chore: remove external URLs from sample data"
```

---

### Task 11: Test offline operation

**Files:** None (manual testing)

- [ ] **Step 1: Stop internet connection**

Disable WiFi or unplug ethernet.

- [ ] **Step 2: Start backend**

Run: `cd backend && npm run dev`

- [ ] **Step 3: Test avatar upload**

Create a character with an avatar → verify image displays.

- [ ] **Step 4: Test PNG export**

Export card as PNG → verify avatar is fetched locally.

- [ ] **Step 5: Test path traversal**

`GET /api/files/characters/../../etc/passwd` → verify 403 response.

- [ ] **Step 6: Commit test results**

Document in `docs/PLAYIME_CHECKLIST.md` Notes/decisions log.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-local-first-file-storage.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
