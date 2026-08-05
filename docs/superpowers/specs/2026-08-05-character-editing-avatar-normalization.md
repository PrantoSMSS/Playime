# Character Card Editing + Avatar Normalization

**Date:** 2026-08-05
**Status:** Approved (revised with hardening requirements)

## Problem

1. **No edit button** — The CardInfoModal has Delete, Export, and New Play, but no way to edit a character after creation.
2. **Avatar format inconsistency** — Uploads preserve the original file extension (JPG → `avatar.jpg`, PNG → `avatar.png`), breaking the expected entity structure where avatars are always PNG.
3. **No image conversion** — The backend has no image processing library, so non-PNG formats are stored as-is.
4. **Avatar dual-source ambiguity** — `avatar` column holds the original data URL even after `avatar_file` is set, creating confusion about which is the source of truth.
5. **Upload endpoint accepts anything** — No MIME validation, no size limits, no corruption detection.

## Architecture Assessment

Most architectural concerns from the hardening review are already addressed:

| Concern | Status | Notes |
|---|---|---|
| Advanced data preservation | ✅ Solved | All SillyTavern fields exist as explicit columns; `extensions` is the catch-all |
| PATCH safety | ✅ Solved | `updateCharacterCard()` only updates supplied fields (`val === undefined` → skip) |
| Import flow | ✅ Solved | PNG/JSON/base64 all handled; `parseSillyTavernCard()` normalizes V1/V2/V3 |
| State ownership | ✅ Solved | All modal state centralized in `chat.svelte.ts` |
| Field parity | ✅ Solved | Backend `CharacterCard` = Frontend `ApiCharacterCard` = `CreateCardInput` |
| Scenario boundary | ✅ Solved | Character scenarios ≠ Story Card scenarios by design |

## Design Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Image library | `sharp` | Industry standard, native bindings, handles all target formats |
| Upload flow | Multipart FormData | Uses existing `POST /api/upload` endpoint, clean separation |
| Editor scope | Full avatar management | Primary + multiple options with add/replace/remove |
| Editor fields | Existing 3 tabs | Identity, Personality, Scenario — no Advanced tab |
| No `advanced_data` field | Skip | Explicit columns + `extensions` catch-all is better for querying/editing |
| No import redesign | Skip | Already mature — PNG/JSON/base64 → `parseSillyTavernCard()` |

## Section 1: Edit Button & Modal Flow

### Changes

- Add **Edit** button to `CardInfoModal` footer (between Delete and Export)
- Clicking Edit calls `openEditCardModal(card)` → opens `CharacterFormModal` in `mode: 'edit'`
- Form pre-populates from existing card data
- On save, calls `PATCH /api/cards/:id` with modified fields only
- `handleCardSaved` in layout closes the modal and refreshes the card list

### Flow

```
CardInfoModal
├── Delete button (existing)
├── Edit button (NEW)
│   └── opens CharacterFormModal(mode='edit', card=...)
├── Export dropdown (existing)
└── New Play button (existing)
```

### Preservation

Untouched fields remain unchanged. The PATCH endpoint only updates fields present in the request body. Compatible fields (extensions, world_info, alternate_greetings, etc.) are preserved because the frontend doesn't send them in the PATCH payload.

**Critical rule:** Editing through CharacterFormModal must NOT remove Character Card fields not represented in the UI. Only fields controlled by the form should be updated. Example:

```
Imported card: Miko
  system_prompt = "..."
  extensions = {...}
  alternate_greetings = [...]

User edits: Name only

Result must still contain:
  system_prompt, extensions, alternate_greetings
```

## Section 2: Avatar Lifecycle Cleanup

### Problem

After `saveAvatarLocally()` succeeds, the DB has three avatar references:

```
avatar         → original data URL (dead weight)
avatar_file    → filesystem path (permanent)
avatars[0].image → filesystem path (permanent)
```

### Fix

After `saveAvatarLocally()` succeeds:

1. Update `avatar_file` with the saved filename
2. Update `avatars` array with the saved filename
3. **Set `avatar` column to `null`**

This establishes the invariant:

```
avatar column     = temporary upload buffer only (cleared after save)
avatar_file       = permanent storage reference (authoritative)
avatars[].image   = permanent storage reference (display)
```

### Implementation

In `backend/src/routes/character.ts`, after `saveAvatarLocally()` succeeds in create/update/import routes, add `{ avatar: null }` to the update payload:

```typescript
updateCharacterCard(id, { avatar_file: avatarFile, avatars, avatar: null });
```

## Section 3: Avatar Upload Hardening

### Current State

`POST /api/upload/:type/:id` accepts any file with no validation.

### Hardened Pipeline

```
Upload (multipart)
  │
  ▼
Check MIME type (reject non-image)
  │
  ▼
Check size (reject > 10MB)
  │
  ▼
Decode with sharp (verify not corrupted)
  │
  ▼
Resize if > 2048x2048 (preserve aspect ratio)
  │
  ▼
Convert to PNG
  │
  ▼
Save to entity directory
  │
  ▼
Return { filename, path }
```

### Validation Rules

| Rule | Value | Error |
|---|---|---|
| MIME type | Must be `image/*` | `invalid_mime` — "Only image files are accepted" |
| Max file size | 10 MB | `file_too_large` — "Image must be under 10MB" |
| Max dimensions | 2048×2048 | Resized automatically (no error) |
| Corruption | Sharp decode fails | `corrupt_image` — "File is not a valid image" |

### Supported Input Formats

- PNG (passthrough)
- JPEG/JPG
- AVIF
- WebP
- GIF (first frame only)

All formats are converted to PNG before storage.

## Section 4: Avatar Upload Pipeline (Frontend)

### New Flow

```
Frontend: FormData with file → POST /api/upload/characters/{id}
Backend: validates → converts to PNG → saves avatar.png
Frontend: receives relative path → includes in card create/update payload
```

### Frontend Changes (`CharacterFormModal`)

1. Replace `FileReader.readAsDataURL()` with `FormData` upload
2. Send file to `POST /api/upload/characters/{id}`
3. Receive relative path back (e.g., `characters/char_abyss_0001/avatar.png`)
4. Include path in the card create/update payload

### Frontend Avatar Contract

- Frontend may temporarily convert selected files into upload-compatible data
- Backend remains responsible for storage normalization (format, path, validation)
- The UI should not assume the database stores the final avatar representation
- Frontend only sends the file upload; backend returns the canonical reference path

### Entity Directory Structure

```
data/entities/characters/char_abyss_0001/
├── avatar.png          ← primary avatar (always PNG)
└── avatars/
    ├── option1.png     ← additional avatar options
    └── option2.png
```

## Section 5: CharacterGrid Architecture

### Presentation-Only Rule

CharacterGrid is presentation-only. It must not directly manage:
- Modal state
- API calls
- Character mutations

All actions should call centralized `chat.svelte.ts` state functions:
- `onnewclick()` → `openCharacterFormModal` (via state)
- `onuploadclick()` → `openImportCardModal` (via state)
- `oncardclick(card)` → `openCardInfoModal(card)` (via state)

This prevents navigation/modal ownership conflicts and keeps state centralized.

### Required UI States

| Component | States |
|---|---|
| **CharacterGrid** | Loading characters · Empty character library · Error loading characters |
| **CharacterFormModal** | Saving · Save failure |
| **ImportCardModal** | Reading file · Parsing card · Importing · Import failure |

**Empty state for CharacterGrid:**
```
No characters yet
[+ New Character]
[Import Character Card]
```

**Loading states:** Show spinner or skeleton while cards load, save, import, or process avatars.

## Section 7: Avatar Management in Editor

### UI in Edit Mode (Identity Tab)

- Current primary avatar with replace/remove controls
- List of existing avatar options with replace/remove controls
- "Add Avatar" button for additional options

### Operations

- **Replace avatar:** Upload new file → POST /api/upload → PATCH card with new path
- **Add avatar:** Upload file → POST /api/upload → PATCH card appending to `avatars[]`
- **Remove avatar:** PATCH card removing from `avatars[]` (file stays on disk for backward compat)

### Safety

Removing an avatar from the card does NOT delete the file — existing sessions may reference it via `avatar_snapshot`. The file becomes orphaned but harmless.

## Section 8: Character Deletion

### Delete UI Location

**Location:** CardInfoModal footer (existing Delete button, confirmed present).

**Requirements:**
- Confirmation required (existing confirmation dialog)
- Delete database record
- Delete character entity folder
- Existing chat sessions must remain readable (snapshots intact)

### Current Behavior

```typescript
deleteCharacterCard(id);   // removes DB row
deleteEntityDir('characters', id);  // removes entity folder
```

Sessions store `character_card_id` but also snapshot `avatar_snapshot` and `starting_scenario_snapshot`. After deletion, the `character_card_id` becomes a dangling reference — but chat history remains intact.

### Current Behavior

```typescript
deleteCharacterCard(id);   // removes DB row
deleteEntityDir('characters', id);  // removes entity folder
```

Sessions store `character_card_id` but also snapshot `avatar_snapshot` and `starting_scenario_snapshot`. After deletion, the `character_card_id` becomes a dangling reference — but chat history remains intact.

### Recommended Fix

Make `character_card_id` nullable in the session table, and on character deletion:

```sql
UPDATE session SET character_card_id = NULL WHERE character_card_id = ?
```

Snapshots remain. No data loss. Clean references.

**Note:** For v1 (single user, no FK constraints), this is optional. The dangling reference is harmless. Implement if time permits.

## Files to Modify

### Backend

| File | Changes |
|---|---|
| `backend/package.json` | Add `sharp` dependency |
| `backend/src/routes/files.ts` | Add sharp conversion, MIME validation, size limits, corruption detection |
| `backend/src/routes/character.ts` | Clear `avatar` column after save; add avatar cleanup on deletion |

### Frontend

| File | Changes |
|---|---|
| `frontend/src/lib/components/chat/CardInfoModal.svelte` | Add Edit button, import `openEditCardModal` |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Replace data URL upload with FormData, add avatar management UI |
| `frontend/src/routes/+layout.svelte` | Wire edit flow (already has `handleCardSaved`) |

### No Changes Needed

| File | Reason |
|---|---|
| `backend/src/models/character.ts` | PATCH already partial, all fields exist |
| `frontend/src/lib/state/chat.svelte.ts` | `openEditCardModal` already exists |
| `frontend/src/lib/api/chat.ts` | `UpdateCardInput` already correct |
| `backend/src/cards/sillytavern.ts` | Import normalization already mature |

## Constraints

- Do NOT store images as base64 in the database
- Do NOT create a separate avatar storage system
- Do NOT break SillyTavern/TavernAI compatibility
- Do NOT remove unknown metadata fields during editing
- Do NOT change Character IDs or slug counter behavior
- Do NOT break existing Story Card references
- Do NOT add `advanced_data` — explicit columns + `extensions` is better
- Do NOT redesign the import pipeline — it's already correct
- Do NOT change PATCH behavior — it's already partial
- Avatar files always stored as PNG in entity directories
- Existing imported Character Cards continue to work
- Existing conversations continue to work

## Testing

### Character Editing

- [ ] CardInfoModal shows Edit button
- [ ] Clicking Edit opens CharacterFormModal in edit mode
- [ ] Form pre-populates with existing card data
- [ ] Saving updates the card without losing untouched fields
- [ ] Compatible fields (extensions, world_info) are preserved
- [ ] Primary avatar can be replaced
- [ ] Additional avatars can be added
- [ ] Avatar options can be removed

### Avatar Upload Hardening

- [ ] PNG upload → stored as PNG
- [ ] JPG upload → converted to PNG
- [ ] JPEG upload → converted to PNG
- [ ] AVIF upload → converted to PNG
- [ ] WebP upload → converted to PNG
- [ ] Non-image file → rejected with `invalid_mime`
- [ ] File > 10MB → rejected with `file_too_large`
- [ ] Corrupted image → rejected with `corrupt_image`
- [ ] Oversized image (> 2048x2048) → resized automatically
- [ ] `avatar` column cleared to null after save

### Integration

- [ ] Create character with JPG avatar → stored as PNG
- [ ] Edit character → replace avatar
- [ ] Edit character → add second avatar
- [ ] Save → reload → everything persists
- [ ] Existing imported cards still work
- [ ] Existing conversations still work
- [ ] Avatar paths remain valid after edit

### Deletion

- [ ] Delete character → DB row removed
- [ ] Delete character → entity folder removed
- [ ] Delete character → existing sessions remain accessible (snapshots intact)
- [ ] (Optional) `character_card_id` set to NULL on deletion
