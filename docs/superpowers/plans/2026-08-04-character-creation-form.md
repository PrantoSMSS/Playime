# Character Creation Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a character creation/editing form, character card grid, and card import modal to the Character tab.

**Architecture:** Three new Svelte components (CharacterFormModal, ImportCardModal, CharacterGrid) plus API client additions and state management updates. The Character tab shows a grid of all characters with `[+ New]` and `[Upload]` buttons. Modals handle creation/editing and import. All backend CRUD endpoints already exist — no backend changes.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, existing design tokens from `app.css`

## Global Constraints

- Use only existing CSS variables from `app.css` — no hardcoded hex values
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — no stores
- Follow existing component patterns from `CardInfoModal.svelte`
- Avatar images stored as base64 data URIs
- No backend changes — all CRUD endpoints already exist
- No authentication or multi-user support

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/api/chat.ts` | Modify | Add `createCard()`, `updateCard()`, `deleteCard()` |
| `frontend/src/lib/state/chat.svelte.ts` | Modify | Add `cards` state, CRUD functions, modal state |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Create | Tabbed create/edit form modal |
| `frontend/src/lib/components/chat/ImportCardModal.svelte` | Create | Upload/import character card modal |
| `frontend/src/lib/components/chat/CharacterGrid.svelte` | Create | Card grid with header buttons |
| `frontend/src/routes/+page.svelte` | Modify | Render CharacterGrid based on nav |
| `frontend/src/routes/+layout.svelte` | Modify | Render CharacterFormModal and ImportCardModal |

---

### Task 1: API Client — Character CRUD Functions

**Files:**
- Modify: `frontend/src/lib/api/chat.ts`

**Interfaces:**
- Produces: `createCard(input)`, `updateCard(id, patch)`, `deleteCard(id)` — consumed by state management (Task 2)

- [ ] **Step 1: Add CreateCardInput and UpdateCardInput types**

Add after the `ApiCharacterCard` interface (~line 77):

```ts
/** Input for creating a new character card. Only `name` is required. */
export interface CreateCardInput {
  name: string;
  avatar?: string | null;
  tagline?: string;
  personality?: string;
  speech_style?: string;
  likes_and_dislikes?: string;
  scenario?: string;
  first_message?: string;
  description?: string;
  tags?: string[];
}

/** Partial patch for updating a character card. */
export interface UpdateCardInput {
  name?: string;
  avatar?: string | null;
  tagline?: string;
  personality?: string;
  speech_style?: string;
  likes_and_dislikes?: string;
  scenario?: string;
  first_message?: string | null;
  description?: string | null;
  tags?: string[];
}
```

- [ ] **Step 2: Add createCard function**

Add after the `getCard` function (~line 282):

```ts
/** Create a new character card. */
export function createCard(input: CreateCardInput): Promise<ApiCharacterCard> {
  return request<ApiCharacterCard>('/api/cards', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 3: Add updateCard function**

```ts
/** Update an existing character card (partial patch). */
export function updateCard(id: string, patch: UpdateCardInput): Promise<ApiCharacterCard> {
  return request<ApiCharacterCard>(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
```

- [ ] **Step 4: Add deleteCard function**

```ts
/** Delete a character card. */
export async function deleteCard(id: string): Promise<void> {
  await request<void>(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
```

- [ ] **Step 5: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/chat.ts
git commit -m "feat: add character CRUD functions to API client"
```

---

### Task 2: State Management — Cards State and Modal State

**Files:**
- Modify: `frontend/src/lib/state/chat.svelte.ts`

**Interfaces:**
- Consumes: `createCard`, `updateCard`, `deleteCard`, `listCards` from `$lib/api/chat`
- Produces: `chat.cards`, `loadCards()`, `saveCard()`, `removeCard()`, `chat.characterFormModal`, `chat.importCardModal`

- [ ] **Step 1: Update imports**

Change line 13 from:

```ts
import { createSession, getCard, listCards, listPersonas, streamMessage } from '../api/chat';
import type { ApiCharacterCard, ApiMessage, ApiPersona } from '../api/chat';
```

to:

```ts
import {
  createSession, getCard, listCards, listPersonas, streamMessage,
  createCard, updateCard, deleteCard,
} from '../api/chat';
import type {
  ApiCharacterCard, ApiMessage, ApiPersona,
  CreateCardInput, UpdateCardInput,
} from '../api/chat';
```

- [ ] **Step 2: Add cards state and modal state to chat object**

Inside the `$state({...})` block, add after `personas` (~line 42):

```ts
/** All loaded character cards. */
cards: [] as ApiCharacterCard[],
/** Character form modal state (create or edit). */
characterFormModal: null as {
  mode: 'create' | 'edit';
  card?: ApiCharacterCard;
} | null,
/** Import card modal visibility. */
importCardModal: false as boolean,
```

- [ ] **Step 3: Add loadCards function**

Add after the `closeCardInfoModal` function (~line 70):

```ts
/** Load all character cards from the backend. */
export async function loadCards(): Promise<void> {
  try {
    chat.cards = await listCards();
  } catch (err) {
    chat.error = err instanceof Error ? err.message : 'Failed to load cards';
  }
}
```

- [ ] **Step 4: Add saveCard function**

```ts
/** Create or update a character card. Returns the saved card. */
export async function saveCard(
  mode: 'create' | 'edit',
  input: CreateCardInput | UpdateCardInput,
  existingId?: string,
): Promise<ApiCharacterCard | null> {
  try {
    let card: ApiCharacterCard;
    if (mode === 'edit' && existingId) {
      card = await updateCard(existingId, input as UpdateCardInput);
    } else {
      card = await createCard(input as CreateCardInput);
    }
    // Refresh the list
    chat.cards = await listCards();
    return card;
  } catch (err) {
    chat.error = err instanceof Error ? err.message : 'Failed to save card';
    return null;
  }
}
```

- [ ] **Step 5: Add removeCard function**

```ts
/** Delete a character card. */
export async function removeCard(id: string): Promise<boolean> {
  try {
    await deleteCard(id);
    chat.cards = chat.cards.filter((c) => c.id !== id);
    return true;
  } catch (err) {
    chat.error = err instanceof Error ? err.message : 'Failed to delete card';
    return false;
  }
}
```

- [ ] **Step 6: Add open/close helpers for the form modal**

```ts
/** Open the character form modal for creating a new card. */
export function openCreateCardModal(): void {
  chat.characterFormModal = { mode: 'create' };
}

/** Open the character form modal for editing an existing card. */
export function openEditCardModal(card: ApiCharacterCard): void {
  chat.characterFormModal = { mode: 'edit', card };
}

/** Close the character form modal. */
export function closeCharacterFormModal(): void {
  chat.characterFormModal = null;
}
```

- [ ] **Step 7: Add open/close helpers for the import modal**

```ts
/** Open the import card modal. */
export function openImportCardModal(): void {
  chat.importCardModal = true;
}

/** Close the import card modal. */
export function closeImportCardModal(): void {
  chat.importCardModal = false;
}
```

- [ ] **Step 8: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/state/chat.svelte.ts
git commit -m "feat: add character cards state and CRUD management"
```

---

### Task 3: CharacterFormModal Component

**Files:**
- Create: `frontend/src/lib/components/chat/CharacterFormModal.svelte`

**Interfaces:**
- Consumes: `saveCard` from `$lib/state/chat.svelte`, `ApiCharacterCard` from `$lib/api/chat`
- Produces: `onclose` and `onsave` callbacks to parent

- [ ] **Step 1: Create the component with props and state**

```svelte
<script lang="ts">
  import type { ApiCharacterCard } from '$lib/api/chat';
  import { saveCard } from '$lib/state/chat.svelte';

  let {
    mode,
    card,
    onclose,
    onsave,
  }: {
    mode: 'create' | 'edit';
    card?: ApiCharacterCard;
    onclose: () => void;
    onsave: (card: ApiCharacterCard) => void;
  } = $props();

  // ── Tab state ──────────────────────────────────────────────────────
  type Tab = 'identity' | 'personality' | 'scenario';
  let activeTab = $state<Tab>('identity');

  // ── Form fields (initialized from card in edit mode) ──────────────
  let name = $state(card?.name ?? '');
  let tagline = $state(card?.tagline ?? '');
  let description = $state(card?.description ?? '');
  let personality = $state(card?.personality ?? '');
  let speechStyle = $state(card?.speech_style ?? '');
  let likesAndDislikes = $state(card?.likes_and_dislikes ?? '');
  let scenario = $state(card?.scenario ?? '');
  let firstMessage = $state(card?.first_message ?? '');
  let avatarDataUri = $state<string | null>(card?.avatar ?? null);
  let tags = $state<string[]>(card?.tags ?? []);

  // ── Derived ────────────────────────────────────────────────────────
  const isEdit = $derived(mode === 'edit');
  const modalTitle = $derived(isEdit ? 'Edit Character' : 'Create New Character');
  const canSave = $derived(name.trim().length > 0);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // ── Avatar upload ──────────────────────────────────────────────────
  let avatarInput = $state<HTMLInputElement | undefined>();

  function handleAvatarClick(): void {
    avatarInput?.click();
  }

  function handleAvatarChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      avatarDataUri = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input so re-uploading the same file triggers change
    input.value = '';
  }

  function handleRemoveAvatar(): void {
    avatarDataUri = null;
  }

  // ── Save ───────────────────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    if (!canSave || saving) return;
    saving = true;
    error = null;

    const input = {
      name: name.trim(),
      avatar: avatarDataUri,
      tagline: tagline.trim(),
      description: description.trim() || null,
      personality: personality.trim(),
      speech_style: speechStyle.trim(),
      likes_and_dislikes: likesAndDislikes.trim(),
      scenario: scenario.trim(),
      first_message: firstMessage.trim() || null,
      tags,
    };

    const result = await saveCard(mode, input, card?.id);
    saving = false;

    if (result) {
      onsave(result);
    } else {
      error = 'Failed to save. Please try again.';
    }
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onclose();
  }
</script>
```

- [ ] **Step 2: Add the template markup**

Add after the script block:

```svelte
<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal" role="dialog" aria-labelledby="form-title">
    <div class="modal__header">
      <h2 id="form-title" class="modal__header-title">{modalTitle}</h2>
      <button class="modal__close" onclick={onclose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tab bar -->
    <div class="modal__tabs">
      <button
        class="modal__tab"
        class:modal__tab--active={activeTab === 'identity'}
        onclick={() => (activeTab = 'identity')}
      >Identity</button>
      <button
        class="modal__tab"
        class:modal__tab--active={activeTab === 'personality'}
        onclick={() => (activeTab = 'personality')}
      >Personality</button>
      <button
        class="modal__tab"
        class:modal__tab--active={activeTab === 'scenario'}
        onclick={() => (activeTab = 'scenario')}
      >Scenario</button>
    </div>

    <div class="modal__body">
      {#if error}
        <p class="modal__error">{error}</p>
      {/if}

      {#if activeTab === 'identity'}
        <!-- Avatar picker -->
        <div class="form-group">
          <label class="form-label">Avatar</label>
          <div class="avatar-picker" onclick={handleAvatarClick} role="button" tabindex="0">
            {#if avatarDataUri}
              <img src={avatarDataUri} alt="Avatar preview" class="avatar-picker__img" />
              <button
                class="avatar-picker__remove"
                onclick|stopPropagation={handleRemoveAvatar}
                aria-label="Remove avatar"
              >×</button>
            {:else}
              <span class="avatar-picker__placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Click to upload
              </span>
            {/if}
          </div>
          <input
            bind:this={avatarInput}
            type="file"
            accept="image/*"
            class="sr-only"
            onchange={handleAvatarChange}
          />
        </div>

        <!-- Name -->
        <div class="form-group">
          <label class="form-label" for="char-name">Name *</label>
          <input
            id="char-name"
            class="form-input"
            type="text"
            placeholder="Character name"
            bind:value={name}
          />
        </div>

        <!-- Tagline -->
        <div class="form-group">
          <label class="form-label" for="char-tagline">Tagline</label>
          <input
            id="char-tagline"
            class="form-input"
            type="text"
            placeholder="Short tagline or subtitle"
            bind:value={tagline}
          />
        </div>

        <!-- Description -->
        <div class="form-group">
          <label class="form-label" for="char-desc">Description</label>
          <textarea
            id="char-desc"
            class="form-textarea"
            rows="3"
            placeholder="A longer description of the character..."
            bind:value={description}
          ></textarea>
        </div>
      {/if}

      {#if activeTab === 'personality'}
        <div class="form-group">
          <label class="form-label" for="char-personality">Personality</label>
          <textarea
            id="char-personality"
            class="form-textarea"
            rows="4"
            placeholder="Dutiful, composed, and quietly protective..."
            bind:value={personality}
          ></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="char-speech">Speech Style</label>
          <textarea
            id="char-speech"
            class="form-textarea"
            rows="3"
            placeholder="Measured and formal toward strangers..."
            bind:value={speechStyle}
          ></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="char-likes">Likes & Dislikes</label>
          <textarea
            id="char-likes"
            class="form-textarea"
            rows="3"
            placeholder="Likes: dawn sword forms, plum blossom tea...&#10;Dislikes: sloppy stances, braggarts..."
            bind:value={likesAndDislikes}
          ></textarea>
        </div>
      {/if}

      {#if activeTab === 'scenario'}
        <div class="form-group">
          <label class="form-label" for="char-scenario">Scenario</label>
          <textarea
            id="char-scenario"
            class="form-textarea"
            rows="4"
            placeholder="The setting and situation for this character..."
            bind:value={scenario}
          ></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="char-first-msg">First Message</label>
          <textarea
            id="char-first-msg"
            class="form-textarea"
            rows="4"
            placeholder="The character's opening message..."
            bind:value={firstMessage}
          ></textarea>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal__footer">
      <button class="btn btn--ghost" onclick={onclose}>Cancel</button>
      <button
        class="btn btn--primary"
        disabled={!canSave || saving}
        onclick={handleSave}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add the styles**

Add after the template:

```svelte
<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .modal {
    position: relative;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    max-width: 560px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .modal__header-title {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }

  .modal__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-raised);
    color: var(--icon);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .modal__close:hover {
    background: var(--accent-soft);
    color: var(--icon-hover);
  }

  /* Tabs */
  .modal__tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-5) 0;
    border-bottom: 1px solid var(--border);
  }

  .modal__tab {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .modal__tab:hover {
    color: var(--text);
  }
  .modal__tab--active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: var(--font-weight-medium);
  }

  .modal__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .modal__error {
    margin: 0;
    padding: var(--space-3);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: #fca5a5;
    font-size: var(--font-size-sm);
  }

  .modal__footer {
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  /* Form elements */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  .form-input {
    width: 100%;
    padding: var(--space-3);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: var(--font-size-sm);
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .form-input:focus {
    border-color: var(--accent);
  }
  .form-input::placeholder {
    color: var(--text-muted);
  }

  .form-textarea {
    width: 100%;
    padding: var(--space-3);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: var(--font-size-sm);
    font-family: inherit;
    resize: vertical;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .form-textarea:focus {
    border-color: var(--accent);
  }
  .form-textarea::placeholder {
    color: var(--text-muted);
  }

  /* Avatar picker */
  .avatar-picker {
    width: 120px;
    height: 120px;
    border-radius: var(--radius-md);
    border: 2px dashed var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    position: relative;
    transition: border-color var(--transition-fast);
  }
  .avatar-picker:hover {
    border-color: var(--accent-muted);
  }

  .avatar-picker__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-picker__remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    line-height: 1;
  }
  .avatar-picker__remove:hover {
    background: rgba(239, 68, 68, 0.8);
  }

  .avatar-picker__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  /* Buttons */
  .btn {
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn--ghost {
    color: var(--text-secondary);
  }
  .btn--ghost:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
  }
  .btn--primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .btn--primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
</style>
```

- [ ] **Step 4: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: add CharacterFormModal component"
```

---

### Task 4: ImportCardModal Component

**Files:**
- Create: `frontend/src/lib/components/chat/ImportCardModal.svelte`

**Interfaces:**
- Consumes: `ApiCharacterCard` from `$lib/api/chat`
- Produces: `onclose` and `onimported` callbacks

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import type { ApiCharacterCard } from '$lib/api/chat';
  import { PUBLIC_API_BASE_URL } from '$env/static/public';

  let {
    onclose,
    onimported,
  }: {
    onclose: () => void;
    onimported: (card: ApiCharacterCard) => void;
  } = $props();

  const BASE = (PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

  let fileInput = $state<HTMLInputElement | undefined>();
  let jsonText = $state('');
  let importing = $state(false);
  let error = $state<string | null>(null);

  function handleFileClick(): void {
    fileInput?.click();
  }

  async function handleFileChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await importFile(file);
  }

  async function importFile(file: File): Promise<void> {
    importing = true;
    error = null;
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      // Extract base64 portion (remove "data:...;base64," prefix)
      const base64 = dataUri.split(',')[1] ?? '';
      const res = await fetch(`${BASE}/api/cards/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64 }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Import failed (${res.status})`);
      }
      const card = (await res.json()) as ApiCharacterCard;
      onimported(card);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Import failed';
    } finally {
      importing = false;
    }
  }

  async function handleJsonImport(): Promise<void> {
    if (!jsonText.trim()) return;
    importing = true;
    error = null;
    try {
      // Validate JSON first
      const parsed = JSON.parse(jsonText);
      const res = await fetch(`${BASE}/api/cards/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Import failed (${res.status})`);
      }
      const card = (await res.json()) as ApiCharacterCard;
      onimported(card);
    } catch (err) {
      if (err instanceof SyntaxError) {
        error = 'Invalid JSON — please check the format';
      } else {
        error = err instanceof Error ? err.message : 'Import failed';
      }
    } finally {
      importing = false;
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void importFile(file);
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal" role="dialog" aria-labelledby="import-title">
    <div class="modal__header">
      <h2 id="import-title" class="modal__header-title">Import Character Card</h2>
      <button class="modal__close" onclick={onclose} aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="modal__body">
      {#if error}
        <p class="modal__error">{error}</p>
      {/if}

      <!-- Drop zone -->
      <div
        class="drop-zone"
        onclick={handleFileClick}
        ondrop={handleDrop}
        ondragover={handleDragOver}
        role="button"
        tabindex="0"
      >
        {#if importing}
          <p class="drop-zone__text">Importing...</p>
        {:else}
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p class="drop-zone__text">Drag & drop or click to upload</p>
          <p class="drop-zone__hint">Supports: .png (character card) &middot; .json</p>
        {/if}
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept=".png,.json"
        class="sr-only"
        onchange={handleFileChange}
      />

      <!-- Or paste JSON -->
      <div class="form-group">
        <label class="form-label" for="json-paste">Or paste card JSON directly:</label>
        <textarea
          id="json-paste"
          class="form-textarea"
          rows="4"
          placeholder='{ "name": "...", "personality": "..." }'
          bind:value={jsonText}
        ></textarea>
      </div>
    </div>

    <div class="modal__footer">
      <button class="btn btn--ghost" onclick={onclose}>Cancel</button>
      <button
        class="btn btn--primary"
        disabled={importing || (!jsonText.trim())}
        onclick={handleJsonImport}
      >
        {importing ? 'Importing...' : 'Import'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .modal {
    position: relative;
    background: var(--surface-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border);
  }

  .modal__header-title {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }

  .modal__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-raised);
    color: var(--icon);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .modal__close:hover {
    background: var(--accent-soft);
    color: var(--icon-hover);
  }

  .modal__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .modal__error {
    margin: 0;
    padding: var(--space-3);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: #fca5a5;
    font-size: var(--font-size-sm);
  }

  .modal__footer {
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-8) var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    color: var(--text-muted);
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .drop-zone:hover {
    border-color: var(--accent-muted);
    background: var(--bg-raised);
  }

  .drop-zone__text {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .drop-zone__hint {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  .form-textarea {
    width: 100%;
    padding: var(--space-3);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: var(--font-size-sm);
    font-family: inherit;
    resize: vertical;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .form-textarea:focus {
    border-color: var(--accent);
  }
  .form-textarea::placeholder {
    color: var(--text-muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn--ghost {
    color: var(--text-secondary);
  }
  .btn--ghost:hover:not(:disabled) {
    background: var(--bg-raised);
    color: var(--text);
  }
  .btn--primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  .btn--primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
</style>
```

- [ ] **Step 6: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/components/chat/ImportCardModal.svelte
git commit -m "feat: add ImportCardModal component"
```

---

### Task 5: CharacterGrid Component

**Files:**
- Create: `frontend/src/lib/components/chat/CharacterGrid.svelte`

**Interfaces:**
- Consumes: `ApiCharacterCard` from `$lib/api/chat`, `openCardInfoModal`, `openCreateCardModal`, `openImportCardModal` from `$lib/state/chat.svelte`
- Produces: Renders the character card grid; clicks trigger state functions

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import { chat, openCardInfoModal, openCreateCardModal, openImportCardModal } from '$lib/state/chat.svelte';

  function handleCardClick(cardId: string): void {
    void openCardInfoModal(cardId);
  }
</script>

<div class="char-grid">
  <div class="char-grid__header">
    <h1 class="char-grid__title">Character</h1>
    <div class="char-grid__actions">
      <button class="action-btn" onclick={openCreateCardModal}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>New</span>
      </button>
      <button class="action-btn" onclick={openImportCardModal}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>Upload</span>
      </button>
    </div>
  </div>

  {#if chat.cards.length === 0}
    <div class="char-grid__empty">
      <p>No characters yet.</p>
      <p>Create one with <strong>[+ New]</strong> or import an existing card with <strong>[Upload]</strong>.</p>
    </div>
  {:else}
    <div class="char-grid__cards">
      {#each chat.cards as card (card.id)}
        <button class="char-card" onclick={() => handleCardClick(card.id)}>
          <div class="char-card__image">
            {#if card.avatar}
              <img src={card.avatar} alt={card.name} />
            {:else}
              <span class="char-card__initials">{card.name.slice(0, 2).toUpperCase()}</span>
            {/if}
          </div>
          <div class="char-card__info">
            <span class="char-card__name">{card.name}</span>
            {#if card.tagline}
              <span class="char-card__tagline">{card.tagline}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .char-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: var(--space-5) var(--space-6);
  }

  .char-grid__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .char-grid__title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }

  .char-grid__actions {
    display: flex;
    gap: var(--space-3);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-elevated);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }
  .action-btn:hover {
    border-color: var(--accent-muted);
    background: var(--accent-soft);
    color: var(--text);
  }

  .char-grid__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }
  .char-grid__empty p {
    margin: 0;
  }

  .char-grid__cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-4);
  }

  .char-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface-elevated);
    overflow: hidden;
    text-align: left;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .char-card:hover {
    border-color: var(--accent-muted);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .char-card__image {
    width: 100%;
    aspect-ratio: 1;
    background: var(--bg-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .char-card__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .char-card__initials {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--text-muted);
  }

  .char-card__info {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 56px;
  }

  .char-card__name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .char-card__tagline {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }
</style>
```

- [ ] **Step 2: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterGrid.svelte
git commit -m "feat: add CharacterGrid component"
```

---

### Task 6: Page Integration — Wire Everything Together

**Files:**
- Modify: `frontend/src/routes/+page.svelte`
- Modify: `frontend/src/routes/+layout.svelte`

**Interfaces:**
- Consumes: All components and state from Tasks 2–5
- Produces: The complete Character tab with grid and modals

- [ ] **Step 1: Update +layout.svelte to render modals**

Replace the current `+layout.svelte` content with:

```svelte
<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import CardInfoModal from '$lib/components/chat/CardInfoModal.svelte';
  import CharacterFormModal from '$lib/components/chat/CharacterFormModal.svelte';
  import ImportCardModal from '$lib/components/chat/ImportCardModal.svelte';
  import NavRail from '$lib/components/chat/NavRail.svelte';
  import {
    chat, closeCardInfoModal, startNewPlay,
    closeCharacterFormModal, closeImportCardModal, loadCards,
  } from '$lib/state/chat.svelte';
  import type { ApiCharacterCard } from '$lib/api/chat';

  let { children } = $props();

  // Load cards on mount
  $effect(() => {
    void loadCards();
  });

  function handleCardSaved(_card: ApiCharacterCard): void {
    closeCharacterFormModal();
  }

  function handleCardImported(_card: ApiCharacterCard): void {
    closeImportCardModal();
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Playime</title>
</svelte:head>

<div class="app">
  <NavRail />
  <main class="app__main">
    {@render children()}
  </main>
</div>

{#if chat.cardInfoModal}
  <CardInfoModal
    card={chat.cardInfoModal.card}
    onclose={closeCardInfoModal}
    onstartplay={startNewPlay}
  />
{/if}

{#if chat.characterFormModal}
  <CharacterFormModal
    mode={chat.characterFormModal.mode}
    card={chat.characterFormModal.card}
    onclose={closeCharacterFormModal}
    onsave={handleCardSaved}
  />
{/if}

{#if chat.importCardModal}
  <ImportCardModal
    onclose={closeImportCardModal}
    onimported={handleCardImported}
  />
{/if}

<style>
  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }
  .app__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
</style>
```

- [ ] **Step 2: Update +page.svelte to show CharacterGrid**

Replace the current `+page.svelte` content with:

```svelte
<script lang="ts">
  import CharacterGrid from '$lib/components/chat/CharacterGrid.svelte';
  import ChatInput from '$lib/components/chat/ChatInput.svelte';
  import ChatTopBar from '$lib/components/chat/ChatTopBar.svelte';
  import MessageList from '$lib/components/chat/MessageList.svelte';
  import { chat, sendMessage } from '$lib/state/chat.svelte';

  function handleSend(text: string): void {
    void sendMessage(text);
  }
</script>

{#if chat.nav === 'character'}
  <CharacterGrid />
{:else}
  <div class="chat">
    <ChatTopBar />
    <MessageList />
    <div class="chat__composer">
      <ChatInput onSend={handleSend} disabled={chat.sending} />
    </div>
  </div>
{/if}

<style>
  .chat {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .chat__composer {
    padding: var(--space-3) var(--space-6) var(--space-4);
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
</style>
```

- [ ] **Step 3: Verify no type errors**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/+page.svelte frontend/src/routes/+layout.svelte
git commit -m "feat: integrate CharacterGrid and modals into page"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full type check**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 2: Start dev server and verify manually**

Run: `cd frontend && npm run dev`

Verify:
1. Character tab shows empty state with "No characters yet"
2. Clicking `[+ New]` opens the create modal
3. Filling in Name + Save creates a card that appears in the grid
4. Clicking a card opens CardInfoModal
5. `[Upload]` opens the import modal
6. Importing a PNG/JSON card adds it to the grid

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments to character creation form"
```
