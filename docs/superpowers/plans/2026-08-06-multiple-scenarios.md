# Multiple Scenarios per Character Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Scenario textarea in CharacterFormModal with a list of editable, collapsible scenario cards supporting add/remove/validation.

**Architecture:** Single-file UI change in `CharacterFormModal.svelte`. The backend, data model, and CardInfoModal already handle multiple scenarios — no backend changes needed. The form state changes from two scalar variables (`scenario`, `firstMessage`) to an array of `ScenarioEntry` objects. Save logic builds `starting_scenarios[]` from the array.

**Tech Stack:** Svelte 5 (runes: `$state`, `$derived`, `$effect`), TypeScript, existing CSS custom properties.

## Global Constraints

- Svelte 5 runes syntax only (`$state`, `$derived`, `$props`, `$effect`) — no Svelte 4 stores
- No new files — all changes in `CharacterFormModal.svelte`
- Backend already accepts `starting_scenarios[]` on POST/PATCH — no API changes
- Legacy `scenario`/`first_message` scalar fields are derived by the backend's `normalizeStartingScenarios()` — do not send them from the form
- Existing session snapshots (`starting_scenario_id` + `starting_scenario_snapshot`) are immutable once created — removing a scenario from a card does not affect past sessions
- Soft max 12 scenarios — UI nudge, not hard error

---

## File Map

| File | Responsibility | Change Type |
|---|---|---|
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Scenario tab UI, form state, validation, save logic | Modify (lines 21–34, 130–224, 443–465, 816+) |

---

### Task 1: Replace Scenario State Variables

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterFormModal.svelte:21-34, 54`

**Interfaces:**
- Consumes: `card.starting_scenarios` (edit mode), `importedData.starting_scenarios` / `importedData.scenario` / `importedData.first_message` (create mode)
- Produces: `scenarios: ScenarioEntry[]` — used by Task 2 (UI) and Task 3 (save logic)

- [ ] **Step 1: Define the ScenarioEntry type**

Add after line 21 (the `Tab` type):

```typescript
type ScenarioEntry = {
	id: string;
	name: string;
	description: string;
	scenario: string;
	first_message: string;
};
```

- [ ] **Step 2: Replace scenario/firstMessage state with scenarios array**

Remove lines 33-34:
```typescript
let scenario = $state(importedData?.scenario ?? card?.scenario ?? '');
let firstMessage = $state(importedData?.first_message ?? card?.first_message ?? '');
```

Add in their place:
```typescript
/** Initialize scenario list from card data, imported data, or a single blank entry. */
function initScenarios(): ScenarioEntry[] {
	// Edit mode: use card's starting_scenarios, or wrap legacy fields
	if (card) {
		if (card.starting_scenarios.length > 0) {
			return card.starting_scenarios.map((s) => ({
				id: s.id,
				name: s.name,
				description: s.description ?? '',
				scenario: s.scenario,
				first_message: s.first_message,
			}));
		}
		if (card.scenario || card.first_message) {
			return [{
				id: 'default',
				name: 'Default',
				description: '',
				scenario: card.scenario,
				first_message: card.first_message ?? '',
			}];
		}
		return [createBlankScenario()];
	}

	// Create mode with import
	if (importedData?.starting_scenarios && importedData.starting_scenarios.length > 0) {
		return importedData.starting_scenarios.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description ?? '',
			scenario: s.scenario,
			first_message: s.first_message,
		}));
	}
	if (importedData?.scenario || importedData?.first_message) {
		return [{
			id: 'default',
			name: 'Default',
			description: '',
			scenario: importedData.scenario ?? '',
			first_message: importedData.first_message ?? '',
		}];
	}

	return [createBlankScenario()];
}

function createBlankScenario(): ScenarioEntry {
	return { id: crypto.randomUUID(), name: '', description: '', scenario: '', first_message: '' };
}

let scenarios = $state<ScenarioEntry[]>(initScenarios());
```

- [ ] **Step 3: Remove canSave derived (replaced in Task 3)**

Remove line 54:
```typescript
const canSave = $derived(name.trim().length > 0 && !saving);
```

This will be rebuilt in Task 3 with scenario validation. For now, comment it out or remove — Task 3 will restore it.

- [ ] **Step 4: Verify no remaining references to `scenario` or `firstMessage` variables**

Search the file for `scenario` and `firstMessage` variable usages outside the new `scenarios` array. The Scenario tab template (lines 443-465) will reference them — those lines will be replaced in Task 2. The save handler references them — that will be replaced in Task 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: replace scenario scalars with ScenarioEntry array in form state"
```

---

### Task 2: Replace Scenario Tab UI with Collapsible Card List

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterFormModal.svelte:443-465` (Scenario tab template)

**Interfaces:**
- Consumes: `scenarios: ScenarioEntry[]` from Task 1
- Produces: Visual scenario cards with expand/collapse, remove, add functionality. Validation errors displayed inline (Task 3 wires the validation state).

- [ ] **Step 1: Add scenario validation state variables**

Add near the other state variables (after `scenarios` from Task 1):

```typescript
let expandedScenarioIds = $state<Record<string, boolean>>({});
let scenarioErrors = $state<Record<string, Record<string, string>>>({});

function toggleExpanded(id: string): void {
	expandedScenarioIds[id] = !expandedScenarioIds[id];
}

function isExpanded(id: string): boolean {
	return expandedScenarioIds[id] ?? false;
}

function addScenario(): void {
	if (scenarios.length >= 12) return;
	const entry = createBlankScenario();
	scenarios.push(entry);
	expandedScenarioIds[entry.id] = true;
	// Scroll into view after DOM update
	requestAnimationFrame(() => {
		const el = document.getElementById(`scenario-card-${entry.id}`);
		el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});
}

function removeScenario(id: string): void {
	const idx = scenarios.findIndex((s) => s.id === id);
	if (idx < 0) return;
	const s = scenarios[idx];
	// Confirmation only if scenario/first_message/description have content
	const needsConfirm = s.scenario.trim() || s.first_message.trim() || s.description.trim();
	if (needsConfirm && !confirm('Remove this scenario?')) return;
	scenarios.splice(idx, 1);
	delete expandedScenarioIds[id];
	delete scenarioErrors[id];
}

function scenarioDisplayName(entry: ScenarioEntry, index: number): string {
	return entry.name.trim() || `Scenario ${index + 1}`;
}

/** Clear a specific field error when the user types. */
function clearScenarioError(id: string, field: string): void {
	if (scenarioErrors[id]) {
		delete scenarioErrors[id][field];
		if (Object.keys(scenarioErrors[id]).length === 0) {
			delete scenarioErrors[id];
		}
	}
}
```

- [ ] **Step 2: Replace the Scenario tab template content**

Replace lines 443-465 (the `{#if activeTab === 'scenario'}...{/if}` block) with:

```svelte
{#if activeTab === 'scenario'}
	<div class="scenario-list">
		{#each scenarios as entry, i (entry.id)}
			<div
				class="scenario-card"
				class:scenario-card--expanded={isExpanded(entry.id)}
				id="scenario-card-{entry.id}"
			>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="scenario-card__header"
					onclick={() => toggleExpanded(entry.id)}
				>
					<span class="scenario-card__title">
						{scenarioDisplayName(entry, i)}
						{#if i === 0}
							<span class="scenario-card__badge">Default</span>
						{/if}
					</span>
					<div class="scenario-card__header-actions">
						{#if scenarios.length > 1}
							<button
								class="scenario-card__remove"
								title="Remove scenario"
								onclick={(e) => { e.stopPropagation(); removeScenario(entry.id); }}
							>
								×
							</button>
						{/if}
						<span class="scenario-card__chevron">
							{isExpanded(entry.id) ? '▾' : '▸'}
						</span>
					</div>
				</div>

				{#if isExpanded(entry.id)}
					<div class="scenario-card__body">
						<div class="modal__field">
							<label class="modal__label" for="scenario-name-{entry.id}">Name</label>
							<input
								id="scenario-name-{entry.id}"
								class="modal__input"
								class:modal__input--error={scenarioErrors[entry.id]?.name}
								type="text"
								placeholder="e.g. Summer Vacation, Dark Timeline"
								bind:value={entry.name}
								oninput={() => clearScenarioError(entry.id, 'name')}
							/>
							{#if scenarioErrors[entry.id]?.name}
								<span class="modal__field-error">{scenarioErrors[entry.id].name}</span>
							{/if}
						</div>

						<div class="modal__field">
							<label class="modal__label" for="scenario-desc-{entry.id}">Description <span class="modal__label-optional">(optional)</span></label>
							<input
								id="scenario-desc-{entry.id}"
								class="modal__input"
								type="text"
								placeholder="Short subtitle for the scenario picker"
								bind:value={entry.description}
							/>
						</div>

						<div class="modal__field">
							<label class="modal__label" for="scenario-text-{entry.id}">Scenario</label>
							<textarea
								id="scenario-text-{entry.id}"
								class="modal__textarea"
								class:modal__textarea--error={scenarioErrors[entry.id]?.scenario}
								rows="5"
								placeholder="Setting, context, and situation for this starting scenario"
								bind:value={entry.scenario}
								oninput={() => clearScenarioError(entry.id, 'scenario')}
							></textarea>
							{#if scenarioErrors[entry.id]?.scenario}
								<span class="modal__field-error">{scenarioErrors[entry.id].scenario}</span>
							{/if}
						</div>

						<div class="modal__field">
							<label class="modal__label" for="scenario-first-{entry.id}">First Message</label>
							<textarea
								id="scenario-first-{entry.id}"
								class="modal__textarea"
								class:modal__textarea--error={scenarioErrors[entry.id]?.first_message}
								rows="6"
								placeholder="The character's opening message for this scenario"
								bind:value={entry.first_message}
								oninput={() => clearScenarioError(entry.id, 'first_message')}
							></textarea>
							{#if scenarioErrors[entry.id]?.first_message}
								<span class="modal__field-error">{scenarioErrors[entry.id].first_message}</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<button
		class="scenario-add-btn"
		disabled={scenarios.length >= 12}
		title={scenarios.length >= 12 ? 'Maximum 12 scenarios' : 'Add another starting scenario'}
		onclick={addScenario}
	>
		+ Add Scenario
	</button>
{/if}
```

- [ ] **Step 3: Add CSS for scenario cards**

Add at the end of the `<style>` block (before the closing `</style>` tag):

```css
/* ── Scenario cards ──────────────────────────────────────────────── */
.scenario-list {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
}

.scenario-card {
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	overflow: hidden;
	transition: border-color var(--transition-fast);
}
.scenario-card--expanded {
	border-color: var(--accent-muted);
}

.scenario-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--space-3) var(--space-4);
	cursor: pointer;
	user-select: none;
	transition: background var(--transition-fast);
}
.scenario-card__header:hover {
	background: var(--accent-soft);
}

.scenario-card__title {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-medium);
	color: var(--text);
}

.scenario-card__badge {
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-medium);
	color: var(--accent);
	background: var(--accent-soft);
	padding: 1px 6px;
	border-radius: var(--radius-pill);
}

.scenario-card__header-actions {
	display: flex;
	align-items: center;
	gap: var(--space-2);
}

.scenario-card__remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	font-size: 16px;
	color: var(--icon);
	transition: background var(--transition-fast), color var(--transition-fast);
}
.scenario-card__remove:hover {
	background: var(--danger-soft, rgba(239, 68, 68, 0.12));
	color: var(--danger, #ef4444);
}

.scenario-card__chevron {
	color: var(--icon);
	font-size: 12px;
}

.scenario-card__body {
	display: flex;
	flex-direction: column;
	gap: var(--space-4);
	padding: 0 var(--space-4) var(--space-4);
}

.scenario-add-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-2);
	width: 100%;
	padding: var(--space-3);
	border: 1px dashed var(--border);
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text-secondary);
	font-size: var(--font-size-sm);
	transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}
.scenario-add-btn:hover:not(:disabled) {
	border-color: var(--accent-muted);
	color: var(--accent);
	background: var(--accent-soft);
}
.scenario-add-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

/* ── Validation error styles ─────────────────────────────────────── */
.modal__input--error,
.modal__textarea--error {
	border-color: var(--danger, #ef4444) !important;
}

.modal__field-error {
	font-size: var(--font-size-xs);
	color: var(--danger, #ef4444);
	margin-top: 2px;
}

.modal__label-optional {
	font-weight: var(--font-weight-normal);
	color: var(--text-muted);
	font-size: var(--font-size-xs);
}
```

- [ ] **Step 4: Verify the modal renders correctly**

Run `npm run dev` in the frontend directory. Open the character form (create or edit). Verify:
- Scenario tab shows a single expanded card with four fields
- "Add Scenario" button appends a new card
- Clicking header collapses/expands
- × button removes (with confirm if content exists)
- Default badge shows on first card
- At 12 scenarios, Add button grays out

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: replace scenario tab with collapsible card list UI"
```

---

### Task 3: Wire Save Logic and Validation

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterFormModal.svelte:130-224` (save handler)

**Interfaces:**
- Consumes: `scenarios: ScenarioEntry[]` from Task 1, validation UI from Task 2
- Produces: Correct `starting_scenarios[]` in the save payload. Blocks save on validation errors.

- [ ] **Step 1: Add validation function**

Add near the other scenario helper functions (after `scenarioDisplayName` from Task 2):

```typescript
function validateScenarios(): boolean {
	scenarioErrors = {};
	let firstErrorId: string | null = null;

	for (const entry of scenarios) {
		const errors: Record<string, string> = {};
		if (!entry.name.trim()) errors.name = 'Required';
		if (!entry.scenario.trim()) errors.scenario = 'Required';
		if (!entry.first_message.trim()) errors.first_message = 'Required';

		if (Object.keys(errors).length > 0) {
			scenarioErrors[entry.id] = errors;
			if (!firstErrorId) firstErrorId = entry.id;
		}
	}

	// Auto-expand the first card with errors
	if (firstErrorId) {
		expandedScenarioIds[firstErrorId] = true;
	}

	return Object.keys(scenarioErrors).length === 0;
}
```

- [ ] **Step 2: Rebuild canSave derived**

Add after the scenario state variables:

```typescript
const canSave = $derived(name.trim().length > 0 && !saving);
```

This is the same as before — validation is checked on save click, not on every keystroke (to avoid noisy red borders while the user is still typing).

- [ ] **Step 3: Replace save handler's scenario logic**

In `handleSave()`, replace the scenario-related parts of both create and edit branches.

**Create mode** — replace the `baseInput` construction (around lines 141-150) to remove `scenario` and `first_message` from the base input:

```typescript
if (mode === 'create') {
	const baseInput: CreateCardInput = {
		name: name.trim(),
		tagline: tagline.trim() || undefined,
		personality: personality.trim() || undefined,
		speech_style: speechStyle.trim() || undefined,
		likes_and_dislikes: likesAndDislikes.trim() || undefined,
		...(description.trim() ? { description: description.trim() } : {}),
	};
```

Then in the imported data merge section, remove `starting_scenarios` from the imported data passthrough (it's now always built from form state), and add it explicitly:

```typescript
	const input: CreateCardInput = {
		...baseInput,
		...(importedData?.avatar ? { avatar: importedData.avatar } : {}),
		...(importedData?.alternate_greetings ? { alternate_greetings: importedData.alternate_greetings } : {}),
		...(importedData?.world_info ? { world_info: importedData.world_info } : {}),
		...(importedData?.extensions ? { extensions: importedData.extensions } : {}),
		...(importedData?.tags ? { tags: importedData.tags } : {}),
		...(importedData?.creator ? { creator: importedData.creator } : {}),
		...(importedData?.creator_notes ? { creator_notes: importedData.creator_notes } : {}),
		...(importedData?.character_version ? { character_version: importedData.character_version } : {}),
		...(importedData?.system_prompt ? { system_prompt: importedData.system_prompt } : {}),
		...(importedData?.post_history_instructions ? { post_history_instructions: importedData.post_history_instructions } : {}),
		...(importedData?.mes_example ? { mes_example: importedData.mes_example } : {}),
		...(importedData?.default_persona ? { default_persona: importedData.default_persona } : {}),
		...(importedData?.creator_name ? { creator_name: importedData.creator_name } : {}),
		starting_scenarios: scenarios.map((s) => ({
			id: s.id,
			name: s.name.trim(),
			description: s.description.trim() || undefined,
			scenario: s.scenario.trim(),
			first_message: s.first_message.trim(),
		})),
	};
```

**Edit mode** — replace the `UpdateCardInput` construction (around lines 186-195) to include `starting_scenarios`:

```typescript
} else {
	const input: UpdateCardInput = {
		name: name.trim(),
		tagline: tagline.trim() || undefined,
		personality: personality.trim() || undefined,
		speech_style: speechStyle.trim() || undefined,
		likes_and_dislikes: likesAndDislikes.trim() || undefined,
		...(description.trim() ? { description: description.trim() } : {}),
		starting_scenarios: scenarios.map((s) => ({
			id: s.id,
			name: s.name.trim(),
			description: s.description.trim() || undefined,
			scenario: s.scenario.trim(),
			first_message: s.first_message.trim(),
		})),
	};
```

- [ ] **Step 4: Add validation call at start of handleSave**

Add at the very beginning of `handleSave()`, before the try block:

```typescript
async function handleSave(): Promise<void> {
	if (!canSave) return;
	if (!validateScenarios()) return;

	try {
		saving = true;
		errorMessage = null;
		// ... rest of handler
```

- [ ] **Step 5: Remove legacy importedData.starting_scenarios passthrough**

In the create mode's imported data merge, remove the line that passes through `starting_scenarios` from imported data:
```typescript
// REMOVE this line:
...(importedData?.starting_scenarios ? { starting_scenarios: importedData.starting_scenarios } : {}),
```

This is now always built from the form's `scenarios` array (which was initialized from imported data in Task 1).

- [ ] **Step 6: Verify save works correctly**

Test cases:
1. Create new character with 1 scenario — save succeeds, card has `starting_scenarios` array with 1 entry
2. Create new character with 3 scenarios — save succeeds, all 3 in array
3. Try saving with empty name on a scenario — save blocked, red error shown, card auto-expands
4. Edit existing card with imported scenarios — scenarios load, edits save correctly
5. Edit card, remove a scenario, save — array reflects removal

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: wire save logic and validation for multiple scenarios"
```

---

### Task 4: Auto-Expand First Scenario on Open

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterFormModal.svelte`

**Interfaces:**
- Consumes: `scenarios` from Task 1
- Produces: First scenario auto-expanded when modal opens

- [ ] **Step 1: Add effect to expand first scenario**

Add after the `scenarios` state initialization:

```typescript
// Auto-expand first scenario on mount
$effect(() => {
	if (scenarios.length > 0 && Object.keys(expandedScenarioIds).length === 0) {
		expandedScenarioIds[scenarios[0].id] = true;
	}
});
```

This ensures the first scenario is always expanded when the modal opens, giving the user immediate context.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: auto-expand first scenario on modal open"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Create character with multiple scenarios**

1. Open character form (create mode)
2. Fill in Identity tab (name required)
3. Switch to Scenario tab
4. Verify: one scenario card is expanded with four fields
5. Fill in scenario 1 (name: "Default Timeline", scenario text, first message)
6. Click "+ Add Scenario"
7. Verify: new card appears, auto-expands, scrolls into view
8. Fill in scenario 2 (name: "Dark Timeline", scenario text, first message)
9. Save
10. Open CardInfoModal for the new character
11. Verify: both scenarios appear as selectable buttons

- [ ] **Step 2: Edit character with existing scenarios**

1. Open character form (edit mode) for a card with 2+ scenarios
2. Verify: both scenarios load, first is expanded
3. Collapse scenario 1, expand scenario 2
4. Edit scenario 2's name
5. Save
6. Reopen edit — verify changes persisted

- [ ] **Step 3: Import SillyTavern card with multiple scenarios**

1. Import a V3 card that has multiple `starting_scenarios`
2. Open character form (edit mode)
3. Verify: imported scenarios appear in the list
4. Verify: each has correct name, description, scenario text, first message

- [ ] **Step 4: Validation edge cases**

1. Try saving with all fields empty — save blocked, first card expanded with errors
2. Fill in name only — save still blocked (scenario + first_message required)
3. Fill everything — save succeeds
4. Add 12 scenarios — verify Add button grays out
5. Remove all but 1 scenario — verify × button hidden on last card

- [ ] **Step 5: Session snapshot independence**

1. Create character with 2 scenarios
2. Start a New Play with scenario 1
3. Go back, edit character, remove scenario 1
4. Verify: existing session still works (its snapshot is intact)
5. Verify: CardInfoModal now shows only scenario 2

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: multiple scenarios per character card — complete"
```
