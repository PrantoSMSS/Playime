# Personas Page — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Scope:** New frontend page + modal form for managing user personas

## Problem

The nav already has a "Personas" link (internal id: `my-titles`), but it leads to a "Coming soon" placeholder. The backend already has full Persona CRUD (table, model, routes, API client), but there's no UI to browse, create, edit, or delete personas. Users have no way to manage their roleplay identities.

## Goal

Add a Personas page accessible from the nav that lets users browse their personas in a card grid, create new ones, edit existing ones, and delete them — using the same UI patterns as the Characters page.

## What Already Works

| Layer | Status |
|---|---|
| `persona` table (id, name, avatar, avatar_file, description, appearance, personality, pronouns) | ✅ DB schema |
| `Persona` type + `CreatePersonaInput` + `UpdatePersonaInput` | ✅ Backend model |
| `createPersona`, `getPersona`, `listPersonas`, `updatePersona`, `deletePersona` | ✅ Backend CRUD |
| GET/POST/PATCH `/api/personas` routes | ✅ API |
| `listPersonas`, `getPersona`, `createPersona`, `updatePersona`, `deletePersona` in `frontend/src/lib/api/chat.ts` | ✅ Frontend API (full CRUD) |
| `ApiPersona` type in frontend | ✅ Frontend types |
| `deleteEntityDir('personas', id)` on delete | ✅ Filesystem cleanup |
| Avatar upload pattern (same as characters) | ✅ Storage |
| `DELETE /api/personas/:id` route | ⚠️ Exists but deletes unconditionally — no session-reference guard (needs fix, see Task 1) |

## Design

### Page Layout

A card grid component (`PersonaGrid.svelte`) rendered inside the existing `+page.svelte` when `nav.activeView === 'my-titles'`. Follows the same layout pattern as the Characters page.

**Grid items (in order):**

1. **"John Doe" card** — built-in default persona, always first, cannot be edited or deleted. Shows a generic/placeholder avatar + "John Doe" + "Defined by each character card" description. Clicking opens a read-only info popup (name + description only, no form). The card is visually distinct (slightly muted or bordered differently) to signal it's the built-in default.
2. **User persona cards** — one per persona in the DB. Avatar thumbnail + name + pronouns + description.
3. **"+" card** — always last, opens the create modal.

**Card content (per user persona card):**
```
┌─────────────────┐
│   [Avatar]      │
│                 │
│  Name           │
│  she/her        │
│  Short desc...  │
└─────────────────┘
```

**Card interactions:**
- Click card → opens Persona Form Modal in edit mode
- Click "+" → opens Persona Form Modal in create mode

**Empty state:** When no user personas exist (only "John Doe" + "+"), show a subtle hint below the grid: "Create a persona to define who you play as."

**Loading state:** Show a skeleton grid (3 placeholder cards) while personas load from the API.

### Persona Form Modal

A tabbed modal (`PersonaFormModal.svelte`), same pattern as `CharacterFormModal`. Two tabs:

**Tab 1: Identity**
| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text input | Yes | Display name |
| Pronouns | text input | No | e.g. "she/her", "they/them" |
| Description | text input | No | Short role description — "Apprentice Mage", "Street samurai" |

**Tab 2: Appearance & Personality**
| Field | Type | Required | Notes |
|---|---|---|---|
| Appearance | textarea | No | Physical description — fed into prompt context |
| Personality | textarea | No | Personality traits — fed into prompt context |

**Avatar:** Upload button at the top of the modal (before tabs), same pattern as character form. Shows current avatar with upload/remove controls.

**Save behavior:** Save button is always visible but **disabled** when name is empty. No click-and-block — the button is grayed out. When the user fills in the name, it enables.

**Tab-switch on validation:** If the user somehow triggers validation (shouldn't happen with disabled button, but defensively), and the error is on a field not currently visible, auto-switch to the tab containing the first error.

**Save action:** Builds `CreatePersonaInput` or `UpdatePersonaInput` from form state. Only `name` is required. All other fields are optional — empty strings are sent as-is (backend handles defaults).

**Delete in modal (edit mode only):** A "Delete" button at the bottom-left of the modal footer (same pattern as `CardInfoModal`). Clicking it swaps to an inline confirmation: "Delete this persona? Yes / No". On "Yes": calls `DELETE /api/personas/:id`. On success: closes modal and removes card from grid. On 409 (active sessions): shows error in the modal footer.

### Delete Flow

1. User opens Persona Form Modal in edit mode
2. Clicks "Delete" in the modal footer
3. Button swaps to inline "Delete this persona? Yes / No" confirmation
4. On "Yes": calls `DELETE /api/personas/:id`
5. Backend pre-checks for referencing sessions → returns 409 with count if sessions exist
6. On success: modal closes, card removed from grid, entity directory cleaned up
7. On 409: error message shown in modal footer ("Cannot delete — N conversation(s) still reference this persona. Delete the conversations first.")

### "John Doe" Built-in — The Fluid Default

"John Doe" is a **blank-slate persona** — it has no personality, appearance, pronouns, or other fields of its own. It is a placeholder meaning "use whatever the card author defined."

**How it works:**
- Each Character Card has a `default_persona` field (already exists in the data model) where the author defines who the player is in that character's story: role, background, personality, appearance, pronouns, etc.
- When the user selects "John Doe" at New Play time, the system resolves the player identity from the **Character Card's `default_persona`**, not from a stored persona.
- If the card has no `default_persona`, the backend currently returns a `400 no_default_persona` error. **This behavior is kept as-is for this feature.** The New Play UI should prevent selecting John Doe on cards without a `default_persona`, or show the backend error if it slips through. Graceful fallback (silently injecting no persona context) is a future enhancement, not part of this scope.

**On the Personas page:**
- Always appears first in the grid
- Shows a generic placeholder avatar (initials "JD" or a default SVG)
- Name: "John Doe"
- Description: "Defined by each character card"
- Clicking opens a small read-only info popup — just the name + description
- Cannot be edited, deleted, or reordered
- The card is visually distinct (slightly muted or bordered differently)

**Example flow:**
1. User picks "John Doe" persona at New Play for character "Yuna"
2. Yuna's card has `default_persona: { label: "Childhood friend", name: "{{player_name}}", role: "Neighbor", personality: "Shy but curious" }`
3. The prompt assembler injects Yuna's `default_persona` as the player identity
4. User only needs to provide their name — everything else comes from the card author's intent

### `DEFAULT_PERSONA` Constant — Naming Note

There is an existing `DEFAULT_PERSONA` constant in `backend/src/models/persona.ts` (lines 193–203) with `id: 'myself'`, `name: 'Myself'`. It is exported but **unused in production code** — only referenced in a test file. It is **not** the mechanism that powers John Doe or default-persona resolution (that's a separate code path in `routes/chat.ts` that merges `card.default_persona` with `player_name`).

**Decision:** Leave `DEFAULT_PERSONA` and its test in place. It is unrelated to John Doe — it represents the "just be yourself" option for sessions that don't pick any persona. Renaming or removing it is a separate cleanup task, not part of this feature. A future reader should not conflate it with the John Doe implementation.

### Nav ID Rename

The nav item currently has `id: 'my-titles'` but `label: 'Personas'`. The `NavView` type in `nav.svelte.ts` includes `'my-titles'` as a valid view.

**Decision:** Rename the id from `'my-titles'` to `'personas'` for semantic clarity. This requires:
1. Update `NavRail.svelte`: change `id: 'my-titles'` → `id: 'personas'`
2. Update `nav.svelte.ts`: change `'my-titles'` → `'personas'` in the `NavView` type union
3. Update `+page.svelte`: change `nav.activeView === 'my-titles'` → `nav.activeView === 'personas'`
4. Grep the entire codebase for `'my-titles'` post-change to confirm no stale references remain

### Backward Compatibility

- Existing sessions that reference `persona_id: 'myself'` or `persona_source: 'default'` continue to work — the built-in persona is resolved at runtime, not stored in the DB
- The `listPersonas()` API already returns user personas — the built-in "John Doe" is added client-side, not from the DB
- No schema changes needed

## Files Changed

| File | Change |
|---|---|
| `frontend/src/lib/components/chat/PersonaGrid.svelte` | New component — card grid (replaces the "Coming soon" placeholder for `'personas'` view) |
| `frontend/src/lib/components/chat/PersonaFormModal.svelte` | New component — create/edit modal with delete-in-modal |
| `frontend/src/routes/+page.svelte` | Add `{:else if nav.activeView === 'personas'}` branch to render `PersonaGrid`; update existing `nav.activeView === 'my-titles'` reference to `'personas'` |
| `frontend/src/lib/state/chat.svelte.ts` | Add persona CRUD state functions (load, create, update, delete) |
| `frontend/src/lib/state/nav.svelte.ts` | Rename `'my-titles'` → `'personas'` in `NavView` type |
| `frontend/src/lib/components/chat/NavRail.svelte` | Rename nav item id from `'my-titles'` → `'personas'` |
| `backend/src/models/persona.ts` | Add `countSessionsForPersona(id)` helper |
| `backend/src/routes/persona.ts` | Add session pre-check to DELETE handler (409 on active sessions) |

## Out of Scope

- Persona usage stats (how many sessions used this persona)
- Persona sharing / export / import
- **Default Persona editing on Character Cards** — the `default_persona` field exists on CharacterCard and is used by John Doe at runtime, but editing it from the Character Form Modal is a separate feature
- **Graceful fallback for `no_default_persona`** — the backend currently returns 400 when John Doe is selected on a card without `default_persona`. Changing this to silently inject no persona context is a future enhancement
- Persona-specific prompt customization (beyond appearance/personality)
- Avatar cropping / editing tools
- Removing or renaming the existing `DEFAULT_PERSONA` constant (separate cleanup)

## Verification

1. Navigate to Personas page from nav — verify grid shows "John Doe" + any existing personas + "+"
2. Verify "John Doe" card is visually distinct and cannot be edited or deleted
3. Click "+" — verify create modal opens with empty fields, Save button disabled (name empty)
4. Fill in name — verify Save button enables
5. Fill in name + appearance, save — verify card appears in grid
6. Click existing persona card — verify edit modal opens with correct data
7. Edit name, save — verify grid updates
8. Open edit modal, click Delete, confirm — verify card removed, modal closes
9. Try deleting a persona with active sessions — verify 409 error shown in modal
10. Try saving with empty name — verify Save button is disabled (no click-through)
11. Grep codebase for `'my-titles'` post-change — verify no stale references remain
