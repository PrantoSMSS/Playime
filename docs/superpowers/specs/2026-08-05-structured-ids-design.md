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
| Story | `story` | `story_<slug>_<seq>` | `story_mountain_trial_0001` |
| Persona | `persona` | `persona_<slug>_<seq>` | `persona_abyssweiss_0001` |
| Session | `sess` | `sess_<seq>` | `sess_0000042` |
| Message | `msg` | `msg_<seq>` | `msg_0000003` |

### Slug Generation Rules

Input: `"Yehwa's Tale"` → Output: `yehwastale`

1. Convert to lowercase
2. Remove all characters except `[a-z0-9]`
3. No delimiter — slug is one continuous string

```typescript
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

### Sequence Counter: Per-Slug

Each unique slug gets its own sequence counter:

```
generateId('char', 'Yehwa')   → char_yehwa_0001
generateId('char', 'Ayaka')   → char_ayaka_0001
generateId('char', 'Yehwa')   → char_yehwa_0002
```

Sessions and messages use a global counter (no slug).

### Sequence Padding

- Named entities (char, story, persona): 4 digits (`0001`)
- Sessions: 7 digits (`0000042`)
- Messages: 7 digits (`0000003`)

---

## Section 2: Atomic Sequence Generation

### Problem

Two simultaneous `generateId('char', 'Yehwa')` calls must not both get `char_yehwa_0001`.

### Solution: SQLite Transaction Lock

```typescript
function generateId(type: EntityType, name?: string): string {
  const db = getDb();
  const slug = name ? toSlug(name) : null;
  const prefix = slug ? `${type}_${slug}_` : `${type}_`;

  // BEGIN IMMEDIATE acquires a write lock — blocks other writers
  db.exec('BEGIN IMMEDIATE');
  try {
    const table = type === 'char' ? 'character_card'
      : type === 'persona' ? 'persona'
      : type === 'sess' ? 'session'
      : type === 'msg' ? 'message'
      : 'story_card'; // future

    const row = db.prepare(
      `SELECT id FROM ${table} WHERE id LIKE ? || '%' ORDER BY id DESC LIMIT 1`
    ).get(`${prefix}`) as { id: string } | undefined;

    let seq = 1;
    if (row) {
      const parts = row.id.split('_');
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }

    const padded = seq.toString().padStart(type === 'sess' || type === 'msg' ? 7 : 4, '0');
    const newId = `${prefix}${padded}`;

    db.exec('COMMIT');
    return newId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
```

### Table Mapping

| Type | Table to query |
|------|----------------|
| `char` | `character_card` |
| `story` | `story_card` (future) |
| `persona` | `persona` |
| `sess` | `session` |
| `msg` | `message` |

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

- `source` identifies where the card originally came from.
- `sourceId` stores the original external ID when importing.
- For cards created directly in Playime, `source` is `playime` and `sourceId` is `null`.
- `sourceId` is metadata only and MUST NOT be used as the Playime character ID.

### Import Flow (`sillytavern.ts`)

When importing a card:

1. Parse the card from PNG/JSON.
2. Extract the original external ID, if available.
3. Store that value as `sourceId`.
4. Set `source` to the appropriate origin (`chub` or `sillytavern`).
5. Generate a new Playime ID using: `generateId('char', card.name)`
6. Store the card using the generated Playime ID and source metadata.

The imported external ID must NEVER be used as the primary Playime ID.

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
| `backend/src/id.ts` | Shared ID generator: `generateId()`, `toSlug()`, atomic sequence allocation |

### Modified Files

| File | Changes |
|------|---------|
| `backend/src/models/character.ts` | Use `generateId('char', name)` instead of `randomUUID()`. Add `source`/`sourceId` fields. Update seed data IDs. |
| `backend/src/models/persona.ts` | Use `generateId('persona', name)` instead of `randomUUID()`. Add `source`/`sourceId` fields. |
| `backend/src/models/session.ts` | Use `generateId('sess')` instead of `randomUUID()` for sessions. Use `generateId('msg')` for messages. |
| `backend/src/cards/sillytavern.ts` | Import flow: extract `sourceId`, set `source`, call `generateId('char', name)`. |
| `backend/db/schema.sql` | Add `source`/`sourceId` columns to `character_card`. |
| `backend/src/db.ts` | Add migration for `source`/`sourceId` columns. |
| `backend/src/routes/character.ts` | Import route passes `source`/`sourceId` through. |

### Frontend

No changes expected. The frontend uses `card.id` as an opaque string — structured IDs are just different strings.

---

## Never Reuse IDs

Even after deletion, a sequence number is never reused. If `char_yehwa_0001` is deleted, the next Yehwa card gets `char_yehwa_0002`.
