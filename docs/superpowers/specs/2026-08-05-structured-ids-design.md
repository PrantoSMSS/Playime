# Structured IDs Design

**Date:** 2026-08-05
**Status:** Approved
**Scope:** Replace random UUIDs with human-readable structured IDs across all entity types

---

## Problem

Current IDs are random UUIDs (`215fb191-9d97-45eb-8029-394ab92fe0d7`) or ad-hoc strings (`yehwa`). These are:
- Not human-readable
- Not traceable to entity type or name
- Inconsistent between seed data and user-created data

## Solution

Introduce a structured ID format: `type_slug_sequence`

---

## Section 1: ID Format Specification

### Entity Types and Formats

| Type | Prefix | Format | Example |
|------|--------|--------|---------|
| Character | `char` | `char_<slug>_<seq>` | `char_yehwa_0001` |
| Story | `story` | `story_<slug>_<seq>` | `story_mountain-trial_0001` |
| Persona | `persona` | `persona_<slug>_<seq>` | `persona_abyssweiss_0001` |
| Session | `sess` | `sess_<seq>` | `sess_0000042` |
| Message | `msg` | `msg_<seq>` | `msg_0000003` |

### Slug Generation Rules

Input: `"Yehwa's Tale"` → Output: `yehwas-tale`

1. Convert to lowercase
2. Replace any non-alphanumeric characters (and runs of them) with a single hyphen
3. Trim leading/trailing hyphens

```typescript
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

This preserves word boundaries for readability:
- `"Mountain Trial"` → `mountain-trial`
- `"MountainTrial"` → `mountaintrial`
- `"Mountain-Trial"` → `mountain-trial`

The slug is used in the ID: `story_mountain-trial_0001`.

### Sequence Counter: Per-Slug

Each unique slug gets its own sequence counter:

```
allocateId('char', 'Yehwa')   → char_yehwa_0001
allocateId('char', 'Ayaka')   → char_ayaka_0001
allocateId('char', 'Yehwa')   → char_yehwa_0002
```

Sessions and messages use a global counter (no slug).

### Sequence Padding

- Named entities (char, story, persona): 4 digits (`0001`)
- Sessions: 7 digits (`0000042`)
- Messages: 7 digits (`0000003`)

---

## Section 2: Atomic Sequence Generation

### Problem

Two simultaneous `allocateId('char', 'Yehwa')` calls must not both get `char_yehwa_0001`.

### Critical Constraint: Never Reuse IDs

Sequence numbers must never be reused, even after deletion. Deriving sequences from existing entity rows fails this — if `char_yehwa_0002` is deleted, querying `MAX(id)` would regenerate it.

### Solution: Dedicated Sequence Table

```sql
CREATE TABLE IF NOT EXISTS id_sequences (
  type      TEXT NOT NULL,    -- 'char', 'story', 'persona', 'sess', 'msg'
  slug      TEXT NOT NULL,    -- slug for named entities, '' for sessions/messages
  next_seq  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (type, slug)
);
```

Each (type, slug) pair has its own monotonic counter. Once a sequence number is allocated, it is never reused — even if the entity is deleted.

### Implementation

```typescript
function allocateId(
  db: DatabaseSync,
  type: EntityType,
  name?: string
): string {
  const slug = name ? toSlug(name) : '';
  const prefix = slug ? `${type}_${slug}_` : `${type}_`;
  const padding = type === 'sess' || type === 'msg' ? 7 : 4;

  // Upsert: insert row with next_seq=2 if not exists (1 is consumed immediately),
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

**IMPORTANT:** `allocateId()` does NOT manage transactions. The caller (model) must wrap it in `BEGIN IMMEDIATE` / `COMMIT` with try/catch/ROLLBACK:

```typescript
function createCharacterCard(input) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const id = allocateId(db, 'char', input.name);
    db.prepare('INSERT INTO character_card ...').run(id, ...);
    db.exec('COMMIT');
    return getCharacterCard(id)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

The try/catch/ROLLBACK is critical: if entity creation fails, the sequence allocation must also roll back. This ensures failed ID attempts don't create permanent gaps in the sequence.

### Sequence Table Semantics

`next_seq` stores the **next available** sequence number. When a new (type, slug) pair is first inserted, `next_seq` is set to `2` because sequence `1` is being consumed immediately. On subsequent calls, `next_seq` is incremented first, then the allocated number is `next_seq - 1`.

Example lifecycle for `char_yehwa`:

| Step | Operation | next_seq after | Allocated ID |
|------|-----------|----------------|--------------|
| 1st call | INSERT (type=char, slug=yehwa, next_seq=2) | 2 | `char_yehwa_0001` |
| 2nd call | UPDATE next_seq = 3 | 3 | `char_yehwa_0002` |
| 3rd call | UPDATE next_seq = 4 | 4 | `char_yehwa_0003` |

### Why This Works

1. `INSERT ... ON CONFLICT DO UPDATE` atomically increments the counter
2. `BEGIN IMMEDIATE` serializes concurrent callers
3. The sequence table is append-only in terms of sequence numbers — no entity deletion can roll back a counter
4. No dependency on entity table contents — works even on empty tables

### Call-Inside-Transaction Guideline

`allocateId()` MUST be called inside the same transaction that creates the entity row, wrapped in try/catch/ROLLBACK. If entity creation fails, the sequence allocation rolls back too. If a crash occurs between successful COMMIT and response, the allocated number is consumed — this is **expected behavior**, not a bug. The "never reuse IDs after successful creation" guarantee means gaps from deletions are acceptable and inevitable.

### Sequence Reservation for Existing Data

When migrating an existing database, sequence numbers must be reserved for all existing structured IDs. The migration scans existing entity tables, parses their IDs, and inserts corresponding rows into `id_sequences`. This prevents `allocateId()` from regenerating IDs that already exist.

For a fresh database, seed data IDs are reserved automatically by the same scan.

### Table Mapping

| Type | Slug source | Example row |
|------|-------------|-------------|
| `char` | `toSlug(name)` | `(char, yehwa, 3)` |
| `story` | `toSlug(name)` | `(story, mountain-trial, 1)` |
| `persona` | `toSlug(name)` | `(persona, abyssweiss, 1)` |
| `sess` | `''` (empty) | `(sess, , 43)` |
| `msg` | `''` (empty) | `(msg, , 182)` |

---

## Section 3: Import Handling & Source Metadata

### New Fields on CharacterCard

```typescript
interface CharacterCard {
  // ... existing fields ...
  source: 'playime' | 'chub' | 'sillytavern';
  sourceId: string | null;
}
```

### Naming Convention

- **TypeScript/API:** camelCase — `sourceId`
- **SQLite:** snake_case — `source_id`
- **`rowToCard()`** maps between them: `sourceId: row.source_id`

This keeps the TypeScript API clean while matching SQLite conventions.

- `source` identifies the **original origin** of the card — where it was first created.
- `sourceId` stores the original external ID when importing.
- For cards created directly in Playime, `source` is `playime` and `sourceId` is `null`.
- `sourceId` is metadata only and MUST NOT be used as the Playime character ID.

### Source Is Original Origin, Not Import Channel

A card can travel between systems:

```text
Created in Playime → exported → imported into SillyTavern → exported → re-imported into Playime
```

On the re-import, `source` should still be `"playime"` — because that's where the card was **originally created**. Do NOT set `source` to `"sillytavern"` just because the import was performed through a SillyTavern-compatible importer.

The rule: `source` reflects where the card was **authored**, not where it was last imported from.

### Import Flow

**Architecture rule:** Parser → extracts metadata. Route/import service → determines source. Model → stores it.

When importing a card:

1. **Parser** (`sillytavern.ts`): Parse the card from PNG/JSON. Extract and return any embedded `source`/`sourceId` metadata. Do NOT set `source` — leave it for the route.
2. **Route** (`routes/character.ts`): Determine `source` based on import origin. If `source` is already set (e.g. re-importing a Playime card), preserve it. Otherwise, set based on the endpoint (`'sillytavern'`, `'chub'`, etc.).
3. **Model** (`createCharacterCard`): Generate a new Playime ID using `allocateId('char', card.name)`. Store the card with the generated ID and source metadata.

The imported external ID must NEVER be used as the primary Playime ID.

### Imported ID Collision

Imported cards MUST always receive a new Playime ID.

The ID embedded in an imported card must never be reused as the new card's primary ID, even when no collision currently exists.

Example:

```
Imported card: char_yehwa_0001

If char_yehwa_0001 already exists:
  → generate char_yehwa_0002

Even if it does NOT exist:
  → still generate the next Playime ID rather than adopting char_yehwa_0001
```

The imported ID is preserved only as source metadata where applicable.

This keeps the ID system consistent: **every card entering Playime gets an ID from Playime's own ID generator.**

### Example — Imported Chub Card

```json
{
  "id": "char_yehwa_0042",
  "source": "chub",
  "sourceId": "abc123xyz",
  "name": "Yehwa"
}
```

### Example — Playime-Created Card

```json
{
  "id": "char_ayaka_0001",
  "source": "playime",
  "sourceId": null,
  "name": "Ayaka"
}
```

### Database Change

Add the following columns to `character_card` via a database migration:

- `source` — required, enum/string
- `sourceId` — nullable string

Existing cards created before this change should be migrated with:

```text
source = 'playime'
sourceId = null
```

### Important

The Playime ID system is authoritative. An imported card's external ID is retained only for provenance/traceability and must not affect Playime ID generation.

---

## Section 4: Seed Data & Existing Records Migration

### Current Seed Characters

| Current ID | New ID |
|------------|--------|
| `'yehwa'` | `char_yehwa_0001` |
| `'215fb191-9d97-45eb-8029-394ab92fe0d7'` | `char_miko_0001` |

### Changes Required

1. **`backend/src/models/character.ts`** — Update seed data:
   ```typescript
   export const YEHWA_CARD: CharacterCard = {
     id: 'char_yehwa_0001',
     name: 'Yehwa',
     source: 'playime',
     sourceId: null,
     // ... rest unchanged
   };

   export const MIKO_CARD: CharacterCard = {
     id: 'char_miko_0001',
     name: 'Miko',
     source: 'playime',
     sourceId: null,
     // ... rest unchanged
   };
   ```

2. **Entity folder rename**:
   ```
   backend/data/entities/characters/yehwa/        → backend/data/entities/characters/char_yehwa_0001/
   backend/data/entities/characters/215fb191.../   → backend/data/entities/characters/char_miko_0001/
   ```

3. **Database migration** — For existing cards:
   - Rename `character_card.id` values to new structured format
   - Set `source = 'playime'` and `sourceId = null`
   - Rename `session.character_card_id` references to match new IDs

4. **Cascade updates** — All foreign key references (`session.character_card_id`) must be updated.

---

## Section 5: Code Changes & File Inventory

### New Files

| File | Purpose |
|------|---------|
| `backend/src/id.ts` | Shared ID generator: `allocateId()`, `toSlug()`, atomic sequence allocation |

### Modified Files

| File | Changes |
|------|---------|
| `backend/src/models/character.ts` | Use `allocateId('char', name)` instead of `randomUUID()`. Add `source`/`sourceId` fields. Update seed data IDs. |
| `backend/src/models/persona.ts` | Use `allocateId('persona', name)` instead of `randomUUID()`. No source/sourceId — personas don't import. |
| `backend/src/models/session.ts` | Use `allocateId('sess')` instead of `randomUUID()` for sessions. Use `allocateId('msg')` for messages. |
| `backend/src/cards/sillytavern.ts` | Import flow: preserve existing `source` if present, extract `sourceId`, call `allocateId('char', name)`. |
| `backend/db/schema.sql` | Add `source`/`sourceId` columns to `character_card`. Add `id_sequences` table. |
| `backend/src/db.ts` | Add migration for `source`/`sourceId` columns, `id_sequences` table, and seed sequence reservation. |
| `backend/src/routes/character.ts` | Import route sets correct `source` based on import origin. |

### Frontend

No changes expected. The frontend uses `card.id` as an opaque string — structured IDs are just different strings.

---

## Never Reuse IDs

Even after deletion, a sequence number is never reused. If `char_yehwa_0001` is deleted, the next Yehwa card gets `char_yehwa_0002`.
