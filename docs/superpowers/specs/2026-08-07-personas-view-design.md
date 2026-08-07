# Personas View — Design Spec

**Date:** 2026-08-07  
**Status:** Approved  
**Feature:** Dedicated Personas page with CRUD operations

## Problem

Personas exist in the backend database and have full CRUD API support (`listPersonas`, `getPersona`, `createPersona`, `updatePersona`, `deletePersona`), but are never fetched or rendered on the frontend. The `my-titles` nav item has no matching view component, so it always falls into the generic "Coming soon" placeholder.

## Design Decisions

1. **Card click behavior:** Two-step flow — clicking a persona card opens a read-only `PersonaInfoModal` first, then "Edit" opens the `PersonaFormModal`. This matches the `CharacterGrid` → `CardInfoModal` → `CharacterFormModal` pattern.

2. **PersonaInfoModal layout:** Simple scrollable card (single column: avatar, name/pronouns, description, appearance, personality). No tabs, no sections.

3. **PersonaFormModal layout:** Single scrollable form with all 6 fields (avatar, name, pronouns, description, appearance, personality). No tabs.

4. **Pronouns input:** Button group (they/them, she/her, he/him, custom) matching the HTML reference. Not a text input.

5. **Avatar upload:** File upload input (click to browse). Backend `uploadAvatar('persona', id, file)` handles saving.

6. **Description character count:** 500 char limit, with count display.

7. **Delete:** Via `DeleteConfirmButton.svelte` reuse, with confirmation dialog.

## Components

### 1. Personas.svelte (grid view)

Modeled on `CharacterGrid.svelte`. Structure:

- **Header:** "Personas" title + "New" button (no Upload — no SillyTavern import for personas)
- **Empty state:** Icon + "No personas yet" + hint to create one
- **Error state:** Error message + Retry button (mirrors `handleRetry` pattern)
- **Card grid:** Each card shows:
  - Avatar (resolved via `resolveFileUrl`) or initials fallback
  - Persona name
  - Pronouns (if present) as secondary line

**Click behavior:** Opens `PersonaInfoModal` (read-only view).

**CSS:** Reuse `.card-grid` / `.card` styling from `CharacterGrid.svelte`.

### 2. PersonaInfoModal.svelte (read-only view)

Based on `persona-card-view.html`. Single scrollable column:

**Header:** "Persona Information" + close button (X)

**Body:**
- **Top section:** 140×140 avatar (or placeholder icon) + name, pronouns badge, description tagline, created/updated timestamps
- **Appearance section:** Title + text, hidden if empty
- **Personality section:** Title + text, hidden if empty

**Footer:**
- Left: Delete button (via `DeleteConfirmButton`)
- Right: Edit button + Done button

**Actions:**
- Edit → calls `openEditPersonaModal()`
- Delete → confirms via `DeleteConfirmButton`, calls `deletePersona()`, refreshes `chat.personas`, closes modal
- Done → closes modal

### 3. PersonaFormModal.svelte (create/edit)

Based on `persona-card-edit.html`. Single scrollable form:

**Header:** "Create Persona" / "Edit Persona" + close button

**Body (6 fields):**
1. **Avatar:** 120×120 picker (dashed border, click to upload, hint text "Profile picture" + format guidance). Shows preview when set. Remove button when set.
2. **Name** (required): Text input with asterisk
3. **Pronouns:** Button group (they/them, she/her, he/him, custom). "custom" shows a text input for free-form entry.
4. **Description:** Textarea, 3 rows, character count (500 max)
5. **Appearance:** Textarea, 4 rows
6. **Personality:** Textarea, 4 rows

**Footer:** Cancel + Save (Save disabled when name is empty)

**Save flow:**
- Create mode: `createPersona()` → refresh `chat.personas` → upload avatar if set → `onsave(result)`
- Edit mode: `updatePersona(id, patch)` → refresh `chat.personas` → upload avatar if changed → remove avatar if removed → `onsave(result)`

### 4. State Changes

**`chat.svelte.ts`:**
- Add `personasError: null as string | null` to `chat` state
- Add `loadPersonas()` function (mirrors `loadCards()`)
- Add `openPersonaInfoModal(persona)` function
- Add `openPersonaFormModal({ mode, persona? })` function
- Add `personaInfoModal` and `personaFormModal` state fields

**`+layout.svelte`:**
- Add `loadPersonas()` to startup `$effect` (parallel with cards/sessions)
- Render `PersonaInfoModal` and `PersonaFormModal` conditionally

**`+page.svelte`:**
- Add `{:else if nav.activeView === 'my-titles'}` branch with `<Personas />`

## Verification

1. **Fetch round-trip:** Create a persona via backend, confirm it appears on Personas page
2. **Empty state:** Zero personas → correct empty state renders
3. **Error state:** Backend unreachable → error + Retry UI
4. **CRUD:** Create, edit, delete via new UI, confirm each persists to backend
5. **New Play picker:** Still works (existing `listPersonas()` call unaffected)
6. **Avatar:** Upload, preview, remove — all round-trip correctly
