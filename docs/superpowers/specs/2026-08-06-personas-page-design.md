# Personas Page — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Scope:** New frontend page + modal form for managing user personas

## Problem

The nav already has a "Personas" link, but it leads nowhere. The backend already has full Persona CRUD (table, model, routes, API client), but there's no UI to browse, create, edit, or delete personas. Users have no way to manage their roleplay identities.

## Goal

Add a Personas page accessible from the nav that lets users browse their personas in a card grid, create new ones, edit existing ones, and delete them — using the same UI patterns as the Characters page.

## What Already Works (No Changes Needed)

| Layer | Status |
|---|---|
| `persona` table (id, name, avatar, avatar_file, description, appearance, personality, pronouns) | ✅ DB schema |
| `Persona` type + `CreatePersonaInput` + `UpdatePersonaInput` | ✅ Backend model |
| `createPersona`, `getPersona`, `listPersonas`, `updatePersona`, `deletePersona` | ✅ Backend CRUD |
| GET/POST/PATCH/DELETE `/api/personas` routes | ✅ API |
| `listPersonas()` in frontend API client | ✅ Frontend API |
| `ApiPersona` type in frontend | ✅ Frontend types |
| `deleteEntityDir('personas', id)` on delete | ✅ Filesystem cleanup |
| Avatar upload pattern (same as characters) | ✅ Storage |

## Design

### Page Layout

A card grid page, accessed from the nav "Personas" link. Follows the same layout pattern as the Characters page.

**Grid items (in order):**

1. **"John Doe" card** — built-in default persona, always first, cannot be edited or deleted. Shows a generic/placeholder avatar + "John Doe" + "Just be yourself" description. Clicking opens a read-only info display (name + description only, no form).
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
- Right-click or long-press → context menu with Delete (with confirmation)

### Persona Form Modal

A tabbed modal, same pattern as `CharacterFormModal`. Two tabs:

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

**Save:** Builds `CreatePersonaInput` or `UpdatePersonaInput` from form state. Only `name` is required. All other fields are optional — empty strings are sent as-is (backend handles defaults).

**Validation:** Save blocked if name is empty. Inline red border + "Required" on the name field.

### Delete Flow

- Click delete on a persona card → confirmation dialog ("Delete this persona?")
- On confirm: calls `DELETE /api/personas/:id`
- Backend pre-checks for referencing sessions (same pattern as the character delete fix) → returns 409 with count if sessions exist
- On success: persona removed from grid, entity directory cleaned up

### "John Doe" Built-in — The Fluid Default

"John Doe" is a **blank-slate persona** — it has no personality, appearance, pronouns, or other fields of its own. It is a placeholder meaning "use whatever the card author defined."

**How it works:**
- Each Character Card has a `default_persona` field (already exists in the data model) where the author defines who the player is in that character's story: role, background, personality, appearance, pronouns, etc.
- When the user selects "John Doe" at New Play time, the system resolves the player identity from the **Character Card's `default_persona`**, not from a stored persona.
- If the card has no `default_persona`, John Doe means "plain yourself" — no persona context injected into the prompt.

**On the Personas page:**
- Always appears first in the grid
- Shows a generic placeholder avatar (initials "JD" or a default SVG)
- Name: "John Doe"
- Description: "Defined by each character card"
- Clicking opens a small read-only info popup — just the name + description
- Cannot be edited, deleted, or reordered
- The card is visually distinct (slightly muted or bordered differently) to signal it's the built-in default

**Example flow:**
1. User picks "John Doe" persona at New Play for character "Yuna"
2. Yuna's card has `default_persona: { label: "Childhood friend", name: "{{player_name}}", role: "Neighbor", personality: "Shy but curious" }`
3. The prompt assembler injects Yuna's `default_persona` as the player identity
4. User only needs to provide their name — everything else comes from the card author's intent

### Backward Compatibility

- Existing sessions that reference `persona_id: 'myself'` or `persona_source: 'default'` continue to work — the built-in persona is resolved at runtime, not stored in the DB
- The `listPersonas()` API already returns user personas — the built-in "John Doe" is added client-side, not from the DB
- No schema changes needed

## Files Changed

| File | Change |
|---|---|
| `frontend/src/routes/personas/+page.svelte` | New page — card grid |
| `frontend/src/lib/components/chat/PersonaFormModal.svelte` | New component — create/edit modal |
| `frontend/src/lib/state/chat.svelte.ts` | Add persona CRUD state functions |
| `frontend/src/lib/components/chat/NavRail.svelte` | Wire "Personas" nav link to the new page |

## Out of Scope

- Persona usage stats (how many sessions used this persona)
- Persona sharing / export / import
- **Default Persona editing on Character Cards** — the `default_persona` field exists on CharacterCard and is used by John Doe at runtime, but editing it from the Character Form Modal is a separate feature (not part of this page)
- Persona-specific prompt customization (beyond appearance/personality)
- Avatar cropping / editing tools

## Verification

1. Navigate to Personas page from nav — verify grid shows "John Doe" + any existing personas + "+"
2. Click "+" — verify create modal opens with empty fields
3. Fill in name + appearance, save — verify card appears in grid
4. Click existing persona card — verify edit modal opens with correct data
5. Edit name, save — verify grid updates
6. Delete a persona — verify confirmation, card removed, no DB errors
7. Try deleting a persona with active sessions — verify 409 error shown
8. Try saving with empty name — verify validation blocks save
9. Verify "John Doe" card cannot be edited or deleted
