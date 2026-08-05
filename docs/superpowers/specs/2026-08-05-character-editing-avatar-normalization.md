# Character Card Editing + Avatar Normalization

**Date:** 2026-08-05
**Status:** Approved

## Problem

1. **No edit button** — The CardInfoModal has Delete, Export, and New Play, but no way to edit a character after creation.
2. **Avatar format inconsistency** — Uploads preserve the original file extension (JPG → `avatar.jpg`, PNG → `avatar.png`), breaking the expected entity structure where avatars are always PNG.
3. **No image conversion** — The backend has no image processing library, so non-PNG formats are stored as-is.

## Design Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Image library | `sharp` | Industry standard, native bindings, handles all target formats |
| Upload flow | Multipart FormData | Uses existing `POST /api/upload` endpoint, clean separation |
| Editor scope | Full avatar management | Primary + multiple options with add/replace/remove |
| Editor fields | Existing 3 tabs | Identity, Personality, Scenario — no Advanced tab |

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

## Section 2: Avatar Upload Pipeline

### Current Flow (broken)

```
Frontend: FileReader.readAsDataURL(file) → data:image/png;base64,...
Backend: receives data URL → extracts extension → saves as avatar.{ext}
Result: avatar.jpg, avatar.png — inconsistent formats
```

### New Flow

```
Frontend: FormData with file → POST /api/upload/characters/{id}
Backend: sharp reads buffer → detects format → converts to PNG → saves avatar.png
Result: always avatar.png
```

### Backend Changes (`POST /api/upload/:type/:id`)

1. Accept the uploaded file buffer via `@fastify/multipart`
2. Validate MIME type (reject non-image uploads with clear error)
3. Use `sharp(buffer).png().toBuffer()` to convert to PNG
4. Save as `avatar.png` (primary) or `avatars/{name}.png` (options)
5. Return `{ filename, path }` with the relative path

### Frontend Changes (`CharacterFormModal`)

1. Replace `FileReader.readAsDataURL()` with `FormData` upload
2. Send file to `POST /api/upload/characters/{id}`
3. Receive relative path back (e.g., `characters/char_abyss_0001/avatar.png`)
4. Include path in the card create/update payload

### Entity Directory Structure

```
data/entities/characters/char_abyss_0001/
├── avatar.png          ← primary avatar (always PNG)
└── avatars/
    ├── option1.png     ← additional avatar options
    └── option2.png
```

### Supported Input Formats

- PNG (passthrough)
- JPEG/JPG
- AVIF
- WebP
- GIF (first frame only)
- BMP
- TIFF

All formats are converted to PNG before storage.

## Section 3: Avatar Management in Editor

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

## Files to Modify

### Backend

| File | Changes |
|---|---|
| `backend/package.json` | Add `sharp` dependency |
| `backend/src/routes/files.ts` | Add sharp conversion to upload endpoint, validate MIME types |
| `backend/src/routes/character.ts` | Update create/update routes to handle multipart avatar uploads |

### Frontend

| File | Changes |
|---|---|
| `frontend/src/lib/components/chat/CardInfoModal.svelte` | Add Edit button, import `openEditCardModal` |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Replace data URL upload with FormData, add avatar management UI |
| `frontend/src/routes/+layout.svelte` | Pass `onedit` callback or wire edit flow |
| `frontend/src/lib/state/chat.svelte.ts` | No changes needed — `openEditCardModal` already exists |

## Constraints

- Do NOT store images as base64 in the database
- Do NOT create a separate avatar storage system
- Do NOT break SillyTavern/TavernAI compatibility
- Do NOT remove unknown metadata fields during editing
- Do NOT change Character IDs or slug counter behavior
- Do NOT break existing Story Card references
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

### Avatar Formats

- [ ] PNG upload → stored as PNG
- [ ] JPG upload → converted to PNG
- [ ] JPEG upload → converted to PNG
- [ ] AVIF upload → converted to PNG
- [ ] WebP upload → converted to PNG
- [ ] Invalid file → clear error message
- [ ] Corrupted image → clear error message
- [ ] Non-image file → rejected with error

### Integration

- [ ] Create character with JPG avatar → stored as PNG
- [ ] Edit character → replace avatar
- [ ] Edit character → add second avatar
- [ ] Save → reload → everything persists
- [ ] Existing imported cards still work
- [ ] Existing conversations still work
- [ ] Avatar paths remain valid after edit
