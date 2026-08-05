# Local-First File Storage — Design

Date: 2026-08-05

## Problem

Playime must work completely offline. Currently, avatars are stored as raw URLs
(e.g. `https://i.pravatar.cc/300?img=32`) or base64 data URIs in the database.
This creates three failure modes when offline:

1. **Sample data** references `i.pravatar.cc` — characters show broken images.
2. **Imported cards** with external avatar URLs break on load.
3. **PNG export** fetches avatar from URL (`character.ts:547`) — fails with 500.

The fix: store every asset as a local file on disk, referenced by relative path.

## Goals

- Every asset lives on disk. No external URLs survive after import/creation.
- Entity-scoped folders scale naturally to future features (AI-generated gallery
  images, per-character assets).
- Serving assets is a single Fastify static route — no per-file handler needed.
- DB columns store filenames, not URLs or base64 blobs.

## Non-goals

- No image processing pipeline (resize, thumbnail, format conversion).
- No cloud sync or multi-device file sharing.
- No cleanup of orphaned files (manual or future task).

## Directory Layout

```
backend/data/
├── playime.db                          # existing SQLite database
└── entities/
    ├── characters/
    │   └── {character-id}/
    │       ├── avatar.png              # primary avatar (also cover image)
    │       ├── avatar-{option-id}.png  # additional avatar options
    │       └── gallery/                # future: AI-generated images per session
    │           └── {image-id}.png
    ├── personas/
    │   └── {persona-id}/
    │       └── avatar.png
    └── stories/
        └── {story-id}/
            ├── avatar.png              # story card avatar
            └── gallery/
                └── {image-id}.png
```

### Naming conventions

| Pattern | Purpose |
|---------|---------|
| `avatar.png` | Primary/default avatar, also serves as cover image |
| `avatar-{option-id}.png` | Additional entries from the `avatars[]` array |
| `gallery/{uuid}.png` | AI-generated images (Phase 7, future) |

File extensions are preserved from the original upload. The patterns above use
`.png` for readability but the system accepts any image format.

## DB Schema Changes

### `character_card` table

```sql
-- Replace avatar TEXT column:
ALTER TABLE character_card DROP COLUMN avatar;
ALTER TABLE character_card ADD COLUMN avatar_file TEXT;  -- e.g. "avatar.png"

-- Replace cover_image TEXT column:
ALTER TABLE character_card DROP COLUMN cover_image;
ALTER TABLE character_card ADD COLUMN cover_file TEXT;   -- e.g. "avatar.png" or NULL

-- avatars JSON array: the `image` field changes from URL/data-URI to filename
-- No schema change needed — the JSON blob is stored as TEXT.
-- After migration: { "id": "abc", "name": "Alt", "image": "avatar-abc.png" }
```

### `persona` table

```sql
ALTER TABLE persona DROP COLUMN avatar;
ALTER TABLE persona ADD COLUMN avatar_file TEXT;
```

### What stays the same

- `session.avatar_snapshot` — JSON snapshot taken at session creation. Contains
  the resolved avatar filename. Historical sessions remain valid after schema
  migration.
- `session.persona_snapshot` — same principle.

## API Design

### Static file serving

Install `@fastify/static` (`npm i @fastify/static`) and register it to serve
the `backend/data/entities/` directory:

```
GET /api/files/{type}/{id}/{filename}
```

Examples:
- `GET /api/files/characters/yehwa/avatar.png`
- `GET /api/files/personas/myself/avatar.png`
- `GET /api/files/characters/yehwa/gallery/abc123.png`

The route validates that `{type}` is one of `characters`, `personas`, `stories`
and that the resolved path does not escape `data/entities/` (path traversal
guard). No authentication — local-only app.

### File upload

```
POST /api/upload/{type}/{id}
Content-Type: multipart/form-data
Body: file field "file"
```

Response:
```json
{ "filename": "avatar.png", "path": "characters/yehwa/avatar.png" }
```

The endpoint:
1. Validates `type` is one of the allowed entity types.
2. Creates the entity directory if it doesn't exist (`mkdir -p`).
3. Saves the uploaded file with the original filename (or `avatar.png` for
   primary uploads).
4. Returns the relative path for the caller to store in the DB.

No size limit beyond what Fastify's default body size allows (configurable).

### Avatar URL in card JSON

The card API continues to return an `avatar` field, but now it contains a
relative path instead of a URL:

```json
{
  "id": "yehwa",
  "avatar": "characters/yehwa/avatar.png",
  "avatars": [
    { "id": "default", "name": "Default", "image": "characters/yehwa/avatar.png" }
  ]
}
```

The frontend resolves this to a full URL by prepending the API base:
```typescript
const avatarUrl = `${BASE}/api/files/${card.avatar}`;
```

## Migration

### On startup: check for missing `entities/` directory

```typescript
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(__dirname, '../../data');
const ENTITIES_DIR = join(DATA_DIR, 'entities');
mkdirSync(join(ENTITIES_DIR, 'characters'), { recursive: true });
mkdirSync(join(ENTITIES_DIR, 'personas'), { recursive: true });
mkdirSync(join(ENTITIES_DIR, 'stories'), { recursive: true });
```

### Card import: download external avatars

When importing a card (SillyTavern V2/V3 or PNG), the import handler:

1. Reads the avatar field from the parsed card.
2. If it's a `data:` URI — decode and save to `entities/characters/{id}/avatar.png`.
3. If it's an `http(s)://` URL — fetch it, save to disk.
4. If it's already a relative path — leave it as-is (re-import).
5. Update the card's `avatar` and `avatars[].image` fields to the local filename.

This runs once per import. After import, no external URLs remain.

### Sample data migration

Replace the hardcoded `https://i.pravatar.cc/300?img=32` URLs in
`frontend/src/lib/data/sample.ts` with either:
- Local placeholder images bundled in `frontend/static/`, or
- Remove the sample sessions entirely (they reference backend data anyway).

### Existing cards in the database

Existing cards with `avatar` containing `http://` or `data:` URIs need a
one-time migration. Options:

**Option A — Lazy migration (recommended):** On first access, if `avatar_file`
is NULL but `avatar` contains data, extract and save to disk, then set
`avatar_file`. This avoids a blocking startup migration for large databases.

**Option B — Startup migration:** On first startup after the schema change, scan
all cards, extract external avatars to disk, update columns. Blocks startup.

The spec recommends **Option A** for zero-downtime upgrades.

## Error Handling

| Scenario | Response |
|----------|----------|
| File not found | 404 with `{ error: { code: 'not_found', message: 'File not found' } }` |
| Path traversal attempt | 403 with `{ error: { code: 'forbidden', message: 'Invalid path' } }` |
| Upload fails (disk full, permissions) | 500 with descriptive message |
| Card has no avatar | `avatar_file` is NULL — frontend shows initials/fallback |

## Frontend Changes

### Avatar rendering

Replace all direct URL references with the resolved path:

```typescript
// Before (breaks offline):
<img src={card.avatar} />

// After (works offline):
<img src={`${BASE}/api/files/${card.avatar}`} />
```

This affects:
- `CharacterGrid.svelte` — character card thumbnails
- `CardInfoModal.svelte` — card info display
- `ChatsList.svelte` — session sidebar avatars
- `MessageList.svelte` — message avatars

### Fallback for missing avatars

When `avatar_file` is NULL, render the character's initials with a colored
background (already exists as `initials` + `hue` in the session model).

### Export functions

The existing `exportCardAsPng` function in `chat.ts` fetches the avatar. After
this change, it fetches from `/api/files/characters/{id}/avatar.png` instead
of an external URL — works offline.

## Testing

1. Start backend with no internet connection.
2. Create a character card with a local avatar upload → verify image displays.
3. Import a SillyTavern card with an external avatar URL → verify avatar is
   downloaded and saved locally, URL is replaced with local path.
4. Export card as PNG → verify avatar is fetched locally and embedded.
5. Verify path traversal: `GET /api/files/characters/../../etc/passwd` returns 403.
6. Verify all existing cards display avatars after lazy migration.
