# Multiple Scenarios per Character Card — Design Spec

**Date:** 2026-08-06
**Status:** Approved
**Scope:** UI-only change in `CharacterFormModal.svelte`

## Problem

The Character Form Modal (create/edit) has a single "Scenario" tab with two textareas: one for `scenario` text and one for `first_message`. The backend data model (`CharacterCard.starting_scenarios[]`) already supports multiple scenarios, and CardInfoModal already renders them as selectable buttons. But the author has no way to create or edit multiple scenarios through the form — they only arrive via SillyTavern import.

## Goal

Let character authors create, edit, reorder, and remove multiple starting scenarios directly in the Character Form Modal's Scenario tab.

## What Already Works (No Changes Needed)

| Layer | Status |
|---|---|
| `CharacterCard.starting_scenarios: StartingScenario[]` | ✅ Data model |
| `character_card.starting_scenarios TEXT DEFAULT '[]'` | ✅ DB schema |
| POST `/api/characters` accepts `starting_scenarios` array | ✅ Create endpoint |
| PATCH `/api/characters/:id` accepts `starting_scenarios` array | ✅ Update endpoint |
| `normalizeStartingScenarios()` fallback for legacy fields | ✅ Backward compat |
| `resolveStartingScenario(card, scenarioId)` | ✅ Runtime resolution |
| CardInfoModal renders multiple scenarios as selectable buttons | ✅ Display |
| Session creation stores `starting_scenario_id` + snapshot | ✅ Session wiring |
| SillyTavern import populates `starting_scenarios[]` | ✅ Import |

## Design

### Scenario Tab UI

Replace the two textareas with a **list of collapsible scenario cards**.

```
┌──────────────────────────────────────────────┐
│  Scenario #1              Default        [×] │
│  ─────────────────────────────────────────── │
│  Name        [________________________]      │
│  Description [________________________]      │
│  Scenario    [________________________]      │
│              [________________________]      │
│  First Msg   [________________________]      │
│              [________________________]      │
│              [________________________]      │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│  Scenario #2                             [×] │
│  ─────────────────────────────────────────── │
│  (collapsed — click header to expand)        │
└──────────────────────────────────────────────┘

            [ + Add Scenario ]
```

#### Scenario Card Fields

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | Display name shown in CardInfoModal picker |
| `description` | No | Subtitle shown below name in picker |
| `scenario` | Yes | Scenario text injected into the prompt |
| `first_message` | Yes | Character's opening message for this scenario |

#### Behavior

- **First scenario is the default.** Shows a "Default" badge. If the first scenario is removed, the next scenario in the list silently becomes the new default (no confirmation prompt beyond the normal remove confirmation). The default cannot be removed when it's the only scenario.
- **Collapse/expand.** Collapsed cards show only name + badge. Click header to expand. Newly added cards auto-expand.
- **Remove.** `×` button on each card header. Confirmation is shown only if any of `scenario`, `first_message`, or `description` has non-whitespace content (a name-only stub does not trigger confirmation). First scenario cannot be removed if it's the only one.
- **Add.** "Add Scenario" button appends a blank card at the end, auto-expands it, scrolls it into view within the modal's scroll container (not the page — use `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` on the modal body wrapper).
- **IDs.** New scenarios get `crypto.randomUUID()` as their `id`. Imported scenarios keep their existing IDs.
- **No reorder.** Order in the list = order displayed in CardInfoModal. Reorder is not in scope for this change.
- **Soft max: 12 scenarios.** The "Add Scenario" button grays out at 12 with a tooltip ("Maximum 12 scenarios"). No hard error — just a UI nudge to keep the CardInfoModal picker manageable.

#### Validation

Save is **blocked** until every scenario card has its required fields filled. On save attempt with empty required fields:
- The scenario card auto-expands (if collapsed).
- Empty required fields (`name`, `scenario`, `first_message`) get a red border + inline helper text ("Required").
- The form does not submit. Focus moves to the first invalid field.

The "Add Scenario" button remains enabled regardless of validation state — users can scaffold structure before filling in content. Only Save enforces completeness.

#### Session Snapshot Independence

Existing sessions store `starting_scenario_id` + `starting_scenario_snapshot` at creation time. Removing or editing a scenario on a card does **not** affect existing or past sessions — they reference their frozen snapshot, not the live scenario list. No migration needed.

### Form State

Replace the existing `scenario` and `firstMessage` state variables with:

```typescript
type ScenarioEntry = {
  id: string;
  name: string;
  description: string;
  scenario: string;
  first_message: string;
};

let scenarios = $state<ScenarioEntry[]>([]);
```

**Initialization:**
- **Edit mode:** Load from `card.starting_scenarios` (if non-empty), else wrap legacy `card.scenario` / `card.first_message` into a single default entry.
- **Create mode with import:** Load from `importedData.starting_scenarios` (if present), else from `importedData.scenario` / `importedData.first_message`, else one blank default entry.
- **Create mode without import:** One blank default entry.

### Save Logic

On save, the form builds `starting_scenarios[]` from the scenario list:

```typescript
const startingScenarios = scenarios.map((s) => ({
  id: s.id,
  name: s.name.trim(),
  description: s.description.trim() || undefined,
  scenario: s.scenario.trim(),
  first_message: s.first_message.trim(),
}));
```

- **Create mode:** `starting_scenarios` is passed in `CreateCardInput`.
- **Edit mode:** `starting_scenarios` is passed in `UpdateCardInput`.
- The `importedData?.starting_scenarios` pass-through is removed — the form now always builds the array from its own state.
- Legacy `scenario` / `first_message` scalar fields are **not sent** — the backend's `normalizeStartingScenarios()` already derives them from the array when needed for backward compat.

### Backward Compatibility

- Existing cards with a single scenario (or legacy `scenario`/`first_message` fields) continue to work — `normalizeStartingScenarios()` handles the fallback.
- Cards created through the form now always populate `starting_scenarios[]` — the legacy scalars are populated by the backend's normalization.
- Import path is unchanged — imported `starting_scenarios[]` is loaded into form state on open.

## Files Changed

| File | Change |
|---|---|
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Scenario tab UI + form state + save logic |

## Out of Scope

- Scenario reordering (drag-and-drop or up/down buttons)
- Per-scenario persona overrides (future Story Card feature)
- Scenario duplication / cloning
- Changes to CardInfoModal (already handles multiple scenarios)
- Changes to backend (already supports multiple scenarios)

## Verification

1. Create a new character with 2+ scenarios — verify both appear in CardInfoModal picker.
2. Edit an existing character — verify scenarios load correctly, adding/removing works.
3. Import a SillyTavern card with multiple scenarios — verify they appear in the form.
4. Start a New Play with a specific scenario — verify the correct `first_message` appears.
5. Verify a character with only the default scenario still works (no regression).
6. Try saving with empty required fields — verify save is blocked with inline errors.
7. Remove the first (default) scenario when 2+ exist — verify next one becomes default.
8. Add a 13th scenario — verify "Add Scenario" button grays out with tooltip.
9. Create a session, then edit the card and remove the session's scenario — verify the session still works (snapshot independence).
10. Click "Add Scenario" in a long list — verify scroll-into-view works within the modal container.
