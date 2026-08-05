# Structured IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace random UUIDs with human-readable structured IDs (`char_yehwa_0001`, `sess_0000042`) across all entity types, with atomic sequence allocation and import traceability.

**Architecture:** Central `id.ts` module with `allocateId()` and `toSlug()`. Dedicated `id_sequences` table for atomic counter allocation. `sourceId`/`source` fields on `character_card` for import provenance (TypeScript uses camelCase `sourceId`, SQLite uses snake_case `source_id`). Models own their transactions with proper try/catch/ROLLBACK and call `allocateId()` inside them. Existing ID sequences are derived from actual DB contents during migration.

**Tech Stack:** Node.js, TypeScript, SQLite (`node:sqlite`), Fastify

## Global Constraints

- IDs never reused after successful creation — gaps from deletions are acceptable
- Failed transactions roll back both the entity AND the sequence allocation
- `allocateId()` must be called inside the entity's own transaction (model owns BEGIN/COMMIT/ROLLBACK)
- Imported cards always get new Playime IDs — never adopt the imported ID
- `source` = original origin (where card was authored), not import channel
- TypeScript API uses camelCase (`sourceId`), SQLite uses snake_case (`source_id`), `rowToCard()` maps between them
- Sequence padding: 4 digits for named entities, 7 for sessions/messages
- Slug rules: lowercase, non-alphanumeric → hyphen, trim edges

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/id.ts` | **Create** | `allocateId()`, `toSlug()`, `EntityType` |
| `backend/db/schema.sql` | **Modify** | Add `id_sequences` table, `source`/`source_id` columns |
| `backend/src/db.ts` | **Modify** | Migration for `id_sequences` + `source`/`source_id` + derive sequence reservations from existing IDs |
| `backend/src/models/character.ts` | **Modify** | Use `allocateId()`, add `source`/`sourceId` to types, update seed data |
| `backend/src/models/persona.ts` | **Modify** | Use `allocateId()` only (no source/sourceId — personas don't import) |
| `backend/src/models/session.ts` | **Modify** | Use `allocateId()` for sessions and messages |
| `backend/src/cards/sillytavern.ts` | **Modify** | Parser extracts metadata only; does not set `source` |
| `backend/src/routes/character.ts` | **Modify** | Route determines `source` based on import origin |

---

### Task 1: Create `id.ts` — the shared ID allocator

**Files:**
- Create: `backend/src/id.ts`

**Interfaces:**
- Produces: `allocateId(db, type, name?): string`, `toSlug(name: string): string`, `EntityType`

- [ ] **Step 1: Create `backend/src/id.ts`**

```typescript
/**
 * Structured ID allocator for Playime entities.
 *
 * Format: type_slug_sequence (e.g. char_yehwa_0001)
 * Sequences are per-slug for named entities, global for sessions/messages.
 * IDs are never reused after successful creation — gaps from deletions are acceptable.
 *
 * IMPORTANT: allocateId() does NOT manage transactions.
 * The caller (model) must wrap it in BEGIN/COMMIT with try/catch/ROLLBACK.
 */
import type { DatabaseSync } from 'node:sqlite';

export type EntityType = 'char' | 'story' | 'persona' | 'sess' | 'msg';

/**
 * Convert a name to a URL-safe slug.
 * "Yehwa's Tale" → "yehwas-tale"
 * "MountainTrial" → "mountaintrial"
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
 */
export function allocateId(
  db: DatabaseSync,
  type: EntityType,
  name?: string
): string {
  const slug = name ? toSlug(name) : '';
  const prefix = slug ? `${type}_${slug}_` : `${type}_`;
  const padding = type === 'sess' || type === 'msg' ? 7 : 4;

  // Upsert: insert with next_seq=2 if new (1 consumed immediately),
  // or increment existing counter
  db.prepare(
    `INSERT INTO id_sequences (type, slug, next_seq) VALUES (?, ?, 2)
     ON CONFLICT (type, slug) DO UPDATE SET next_seq = next_seq + 1`
  ).run(type, slug);

  // Read the value AFTER increment
  const row = db.prepare(
    `SELECT next_seq FROM id_sequences WHERE type = ? AND slug = ?`
  ).get(type, slug) as { next_seq: number };

  // Allocated number is next_seq - 1
  const seq = row.next_seq - 1;
  const padded = seq.toString().padStart(padding, '0');
  return `${prefix}${padded}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/id.ts
git commit -m "feat: add structured ID allocator with atomic sequence allocation"
```

---

### Task 2: Add `id_sequences` table and `source`/`source_id` columns to schema

**Files:**
- Modify: `backend/db/schema.sql`
- Modify: `backend/src/db.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `id_sequences` table, `source`/`source_id` columns on `character_card`, sequence reservation derived from existing IDs

- [ ] **Step 1: Add `id_sequences` table to `schema.sql`**

Add at the end of `backend/db/schema.sql`:

```sql
-- ──────────────────────────────────────────────────────────────────────
-- Structured ID sequence counters
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS id_sequences (
  type      TEXT NOT NULL,    -- 'char', 'story', 'persona', 'sess', 'msg'
  slug      TEXT NOT NULL,    -- slug for named entities, '' for sessions/messages
  next_seq  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (type, slug)
);
```

- [ ] **Step 2: Add `source`/`source_id` columns to schema.sql**

In the `character_card` table definition in `schema.sql`, add after `extensions`:

```sql
  -- Import provenance
  source      TEXT NOT NULL DEFAULT 'playime',    -- original origin: 'playime' | 'chub' | 'sillytavern'
  source_id   TEXT,                               -- original external ID (null if created in Playime)
```

- [ ] **Step 3: Add migrations to `db.ts`**

In `backend/src/db.ts`, add to `runMigrations()` after the existing migrations:

```typescript
  // id_sequences table — ensure it exists for older DBs
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS id_sequences (
      type      TEXT NOT NULL,
      slug      TEXT NOT NULL,
      next_seq  INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (type, slug)
    )`);
  } catch {
    // Table already exists — ignore.
  }

  // source / source_id columns on character_card
  try {
    db.exec(`ALTER TABLE character_card ADD COLUMN source TEXT NOT NULL DEFAULT 'playime'`);
  } catch {
    // Column already exists — ignore.
  }
  try {
    db.exec(`ALTER TABLE character_card ADD COLUMN source_id TEXT`);
  } catch {
    // Column already exists — ignore.
  }
```

- [ ] **Step 4: Add sequence reservation derived from existing IDs**

After the above migrations in `db.ts`, add a function that scans existing entity tables and reserves sequence numbers:

```typescript
  // Reserve sequence numbers from existing IDs so future allocateId() calls don't collide
  reserveExistingIdSequences(db);
```

And define the helper:

```typescript
/**
 * Scan existing entity tables and reserve sequence numbers in id_sequences.
 * This handles both fresh DBs (seed data) and existing DBs with migrated data.
 * Idempotent — ON CONFLICT DO NOTHING preserves already-reserved sequences.
 */
function reserveExistingIdSequences(db: DatabaseSync): void {
  // Parse structured IDs and reserve their sequences.
  // Pattern: type_slug_XXXX (4 digits) or type_XXXXXXX (7 digits for sess/msg)
  const patterns: Array<{ type: string; table: string; hasSlug: boolean }> = [
    { type: 'char', table: 'character_card', hasSlug: true },
    { type: 'persona', table: 'persona', hasSlug: true },
    { type: 'sess', table: 'session', hasSlug: false },
    { type: 'msg', table: 'message', hasSlug: false },
  ];

  const insert = db.prepare(
    `INSERT INTO id_sequences (type, slug, next_seq) VALUES (?, ?, ?)
     ON CONFLICT (type, slug) DO NOTHING`
  );

  for (const { type, table, hasSlug } of patterns) {
    // Only process tables that exist
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(table);
    if (!tableExists) continue;

    const rows = db.prepare(`SELECT id FROM ${table}`).all() as Array<{ id: string }>;

    for (const { id } of rows) {
      // Try to parse as structured ID: type_slug_XXXX or type_XXXXXXX
      const match = hasSlug
        ? id.match(/^([a-z]+)_([a-z0-9-]+)_(\d+)$/)  // char_yehwa_0001
        : id.match(/^([a-z]+)_(\d+)$/);                // sess_0000042

      if (!match) continue; // Not a structured ID (e.g. old UUID) — skip

      if (hasSlug) {
        const [, parsedType, slug, seqStr] = match;
        const nextSeq = parseInt(seqStr, 10) + 1;
        insert.run(parsedType, slug, nextSeq);
      } else {
        const [, parsedType, seqStr] = match;
        const nextSeq = parseInt(seqStr, 10) + 1;
        insert.run(parsedType, '', nextSeq);
      }
    }
  }
}
```

- [ ] **Step 5: Delete existing database to start fresh**

```bash
rm -f backend/data/playime.db backend/data/playime.db-shm backend/data/playime.db-wal
```

- [ ] **Step 6: Commit**

```bash
git add backend/db/schema.sql backend/src/db.ts
git commit -m "feat: add id_sequences table, source/source_id columns, derive reservations from existing IDs"
```

---

### Task 3: Update `CharacterCard` type and `createCharacterCard`

**Files:**
- Modify: `backend/src/models/character.ts`

**Interfaces:**
- Consumes: `allocateId()` from `id.ts`
- Produces: Updated `CharacterCard` type with `source`/`sourceId` (camelCase in TS), new cards use `allocateId()` inside try/catch/ROLLBACK transaction

- [ ] **Step 1: Add `source`/`sourceId` to `CharacterCard` interface**

In `backend/src/models/character.ts`, add to the `CharacterCard` interface after `stats`:

```typescript
  // Import provenance
  source: 'playime' | 'chub' | 'sillytavern';
  sourceId: string | null;
```

Note: TypeScript uses camelCase `sourceId`. SQLite column is `source_id`. The `rowToCard()` function maps between them.

- [ ] **Step 2: Add `source`/`sourceId` to `CreateCharacterCardInput`**

In `CreateCharacterCardInput`, add:

```typescript
  source?: 'playime' | 'chub' | 'sillytavern' | undefined;
  sourceId?: string | null | undefined;
```

- [ ] **Step 3: Add `source`/`sourceId` to `CharacterCardRow`**

In `CharacterCardRow`, add (snake_case to match SQLite):

```typescript
  source: string;
  source_id: string | null;
```

- [ ] **Step 4: Update `rowToCard` to map `source_id` → `sourceId`**

In the `rowToCard` function, add to the return object:

```typescript
  source: row.source as 'playime' | 'chub' | 'sillytavern',
  sourceId: row.source_id,
```

- [ ] **Step 5: Replace `randomUUID()` with `allocateId()` in `createCharacterCard`**

The model owns the transaction with try/catch/ROLLBACK. Replace:

```typescript
export function createCharacterCard(input: CreateCharacterCardInput): CharacterCard {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
```

With:

```typescript
export function createCharacterCard(input: CreateCharacterCardInput): CharacterCard {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'char', input.name);
```

And wrap the INSERT + COMMIT:

```typescript
    db.prepare(`INSERT INTO character_card ...`).run(/* ... */);
    db.exec('COMMIT');
    return getCharacterCard(id)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

Update imports: remove `randomUUID` from `node:crypto`, add `import { allocateId } from '../id.js';`

- [ ] **Step 6: Add `source`/`sourceId` to INSERT statement**

Add `source` and `source_id` to the INSERT column list and VALUES. Map camelCase input to snake_case column:

```typescript
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    // ... existing 33 values ...
    input.source ?? 'playime',     // new: source (column name in DB)
    input.sourceId ?? null,        // new: source_id (mapped from camelCase input)
  );
```

- [ ] **Step 7: Update seed data IDs**

Replace `YEHWA_CARD`:
```typescript
export const YEHWA_CARD: CharacterCard = {
  id: 'char_yehwa_0001',
  name: 'Yehwa',
  source: 'playime',
  sourceId: null,
  // ... rest of fields unchanged
```

Replace `MIKO_CARD`:
```typescript
export const MIKO_CARD: CharacterCard = {
  id: 'char_miko_0001',
  name: 'Miko',
  source: 'playime',
  sourceId: null,
  // ... rest of fields unchanged
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/models/character.ts
git commit -m "feat: use structured IDs for characters, add source/sourceId fields"
```

---

### Task 4: Update `createPersona` to use structured IDs

**Files:**
- Modify: `backend/src/models/persona.ts`

**Interfaces:**
- Consumes: `allocateId()` from `id.ts`
- Produces: New personas use `allocateId('persona', name)` inside try/catch/ROLLBACK transaction

- [ ] **Step 1: Replace `randomUUID()` with `allocateId()`**

The model owns the transaction with try/catch/ROLLBACK. Replace:

```typescript
export function createPersona(input: CreatePersonaInput): Persona {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
```

With:

```typescript
export function createPersona(input: CreatePersonaInput): Persona {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'persona', input.name);
```

And wrap the INSERT + COMMIT:

```typescript
    db.prepare(`INSERT INTO persona ...`).run(/* ... */);
    db.exec('COMMIT');
    return getPersona(id)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

Update imports: remove `randomUUID` from `node:crypto`, add `import { allocateId } from '../id.js';`

Note: Personas do NOT get `source`/`sourceId` fields — they are user-created identities, not imported cards.

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/persona.ts
git commit -m "feat: use structured IDs for personas"
```

---

### Task 5: Update `createSession` and `insertMessage` to use structured IDs

**Files:**
- Modify: `backend/src/models/session.ts`

**Interfaces:**
- Consumes: `allocateId()` from `id.ts`
- Produces: Sessions use `allocateId('sess')`, messages use `allocateId('msg')`, both with try/catch/ROLLBACK

- [ ] **Step 1: Replace `randomUUID()` in `createSession`**

The model owns the transaction with try/catch/ROLLBACK. Replace:

```typescript
export function createSession(input: CreateSessionInput = {}): SessionRow {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
```

With:

```typescript
export function createSession(input: CreateSessionInput = {}): SessionRow {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'sess');
```

And wrap the INSERT + COMMIT:

```typescript
    db.prepare(`INSERT INTO session ...`).run(/* ... */);
    db.exec('COMMIT');
    return { id, ... } as SessionRow;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

Update imports: remove `randomUUID` from `node:crypto`, add `import { allocateId } from '../id.js';`

- [ ] **Step 2: Replace `randomUUID()` in `insertMessage`**

Same pattern — model owns transaction with try/catch/ROLLBACK:

```typescript
export function insertMessage(input: InsertMessageInput): MessageRow {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'msg');
    const visible = input.visible ?? 1;
    const ooc = input.ooc ?? 0;

    db.prepare(`INSERT INTO message ...`).run(id, ...);
    db.exec('COMMIT');
    return { id, ... } as MessageRow;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/session.ts
git commit -m "feat: use structured IDs for sessions and messages"
```

---

### Task 6: Update SillyTavern import to handle source metadata

**Files:**
- Modify: `backend/src/cards/sillytavern.ts`
- Modify: `backend/src/routes/character.ts`

**Interfaces:**
- Consumes: `allocateId()` via `createCharacterCard()`
- Produces: Parser extracts metadata; Route determines `source` and `sourceId`

**Architecture rule:** Parser → extracts metadata. Route/import service → determines source. Model → stores it.

- [ ] **Step 1: Update `parseSillyTavernCard` to return source metadata**

In `backend/src/cards/sillytavern.ts`, ensure the returned `Partial<CharacterCard>` preserves any existing `source`/`sourceId` fields from the imported JSON:

```typescript
  // Preserve existing source metadata if present (e.g. re-importing a Playime card).
  // The ROUTE determines the source, not the parser.
  // If the imported JSON has source/sourceId, pass them through.
  // If not, leave undefined — the route fills them in.
```

- [ ] **Step 2: Update import route to determine source**

In `backend/src/routes/character.ts`, in the POST `/api/cards/import` handler, after `parseSillyTavernCard`:

```typescript
      // Determine source and sourceId.
      // Rule: preserve if already set (e.g. re-importing a Playime card),
      // otherwise set based on import origin.
      if (!card.source) {
        // This endpoint handles SillyTavern-format imports
        card.source = 'sillytavern';
      }
      // sourceId: preserved from parsed card if present, otherwise null
      if (card.sourceId === undefined) {
        card.sourceId = null;
      }
```

The `createCharacterCard()` call will now use `allocateId('char', card.name)` internally, always generating a new Playime ID.

- [ ] **Step 3: Commit**

```bash
git add backend/src/cards/sillytavern.ts backend/src/routes/character.ts
git commit -m "feat: separate parser metadata extraction from route source determination"
```

---

### Task 7: Verify and test

**Files:**
- No new files

**Interfaces:**
- Consumes: All previous tasks
- Produces: Verified working system

- [ ] **Step 1: Start the backend and verify no crashes**

```bash
cd backend && npx tsx src/index.ts
```

Expected: Server starts without errors. `id_sequences` table is created with sequence reservations derived from seed data.

- [ ] **Step 2: Verify seed characters have correct IDs**

```bash
curl -s http://localhost:3000/api/cards | jq '.[].id'
```

Expected:
```json
"char_yehwa_0001"
"char_miko_0001"
```

- [ ] **Step 3: Create a new character and verify ID generation**

```bash
curl -s -X POST http://localhost:3000/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"name": "Ayaka"}' | jq '.id'
```

Expected: `"char_ayaka_0001"`

- [ ] **Step 4: Create another character with same name and verify increment**

```bash
curl -s -X POST http://localhost:3000/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"name": "Yehwa"}' | jq '.id'
```

Expected: `"char_yehwa_0002"` (not `0001` — that's taken by seed data, and the sequence was reserved)

- [ ] **Step 5: Verify source fields (camelCase in API)**

```bash
curl -s http://localhost:3000/api/cards | jq '.[] | {id, source, sourceId}'
```

Expected:
```json
{ "id": "char_yehwa_0001", "source": "playime", "sourceId": null }
{ "id": "char_miko_0001", "source": "playime", "sourceId": null }
{ "id": "char_ayaka_0001", "source": "playime", "sourceId": null }
```

- [ ] **Step 6: Create a session and verify ID format (on a fresh DB)**

Start a new play session and check the session ID — should be `sess_0000001`.

- [ ] **Step 7: Send a message and verify ID format (on a fresh DB)**

Send a chat message and check the message ID — should be `msg_0000001`.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
