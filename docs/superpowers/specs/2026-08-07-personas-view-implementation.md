# Personas View — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-07-personas-view-design.md`  
**Branch:** `worktree-feature+personas-view`  
**Worktree:** `.claude/worktrees/feature+personas-view`

## Implementation Steps

### Step 1: State layer — loadPersonas + error field

**File:** `frontend/src/lib/state/chat.svelte.ts`

1. Add `personasError: null as string | null` to the `chat` state object (next to `cardsError`)
2. Add `loadPersonas()` function:
   ```ts
   export async function loadPersonas(): Promise<void> {
       try {
           chat.personas = await listPersonas();
       } catch (err) {
           chat.personasError = err instanceof Error ? err.message : 'Failed to load personas';
       }
   }
   ```
3. Add modal state fields to `chat`:
   ```ts
   personaInfoModal: null as { persona: ApiPersona } | null,
   personaFormModal: null as { mode: 'create' | 'edit'; persona?: ApiPersona } | null,
   ```
4. Add open/close functions:
   ```ts
   export function openPersonaInfoModal(persona: ApiPersona): void {
       chat.personaInfoModal = { persona };
   }
   export function closePersonaInfoModal(): void {
       chat.personaInfoModal = null;
   }
   export function openPersonaFormModal(mode: 'create' | 'edit', persona?: ApiPersona): void {
       chat.personaFormModal = { mode, persona };
       // If coming from info modal, close it
       chat.personaInfoModal = null;
   }
   export function closePersonaFormModal(): void {
       chat.personaFormModal = null;
   }
   ```
5. Add `deletePersona` to the imports from `'../api/chat'` (it's already imported in the API file)

**Verification:** TypeScript compiles without errors.

### Step 2: Load personas on app start

**File:** `frontend/src/routes/+layout.svelte`

1. Import `loadPersonas` alongside existing imports from `chat.svelte`
2. Add `loadPersonas()` to the startup `$effect`:
   ```ts
   $effect(() => {
       void loadCards().then(() => loadSessions());
       void loadPersonas();
   });
   ```

**Verification:** Personas load on page refresh (check `chat.personas` in console).

### Step 3: Personas.svelte — grid view

**New file:** `frontend/src/lib/components/chat/Personas.svelte`

Model directly on `CharacterGrid.svelte`:

**Script section:**
- Import `chat`, `loadPersonas`, `openPersonaInfoModal`, `openPersonaFormModal` from `chat.svelte`
- Import `resolveFileUrl` from `$lib/api/chat`
- Import `ApiPersona` type from `$lib/api/chat`
- `let loading = $state(false)`
- `handleCardClick(persona)` → calls `openPersonaInfoModal(persona)`
- `getInitials(name)` → first 2 chars uppercase
- `getAvatarUrl(persona)` → resolve `persona.avatar ?? persona.avatar_file`
- `handleRetry()` → sets loading, calls `loadPersonas()`, clears loading

**Template:**
- Outer `.personas-grid` container
- Header: "Personas" title + "New" button (calls `openPersonaFormModal('create')`)
- Empty state (same 3-way branch as CharacterGrid):
  - `chat.personasError` set → error icon + message + Retry button
  - `chat.personas.length === 0` → empty icon + "No personas yet" + hint
  - Otherwise → card grid
- Card grid: `{#each chat.personas as persona (persona.id)}`
  - Each card: button with avatar/initials + name + pronouns (or truncated description)
  - `onclick={() => handleCardClick(persona)}`

**Style section:** Copy from CharacterGrid.svelte, rename classes:
- `.character-grid` → `.personas-grid`
- `.grid-header` → `.personas-header`
- `.grid-header__title` → `.personas-header__title`
- `.grid-header__actions` → `.personas-header__actions`
- Keep `.empty-state`, `.card-grid`, `.card` etc. identical

**Verification:** Component renders in the page when `nav.activeView === 'my-titles'`.

### Step 4: PersonaInfoModal.svelte — read-only view

**New file:** `frontend/src/lib/components/chat/PersonaInfoModal.svelte`

Based on `persona-card-view.html`:

**Script section:**
- Import `Modal` from `./Modal.svelte`
- Import `DeleteConfirmButton` from `./DeleteConfirmButton.svelte`
- Import `chat`, `closePersonaInfoModal`, `openPersonaFormModal`, `loadPersonas` from `chat.svelte`
- Import `deletePersona`, `resolveFileUrl` from `$lib/api/chat`
- Props: `persona: ApiPersona` (from `chat.personaInfoModal.persona`)
- `let deleting = $state(false)`
- `handleEdit()` → calls `openPersonaFormModal('edit', persona)`
- `handleDelete()` → calls `deletePersona(persona.id)`, refreshes `chat.personas`, closes modal
- `formatDate(ts)` → relative time formatting (just now, Xh ago, Xd ago, date)
- `getInitials(name)` → first 2 chars uppercase
- `getAvatarUrl(persona)` → resolve `persona.avatar ?? persona.avatar_file`

**Template:**
```svelte
<Modal title="Persona Information" onclose={closePersonaInfoModal}>
    <!-- Body -->
    <div class="persona-info">
        <!-- Top: avatar + info -->
        <div class="persona-info__top">
            <div class="persona-info__avatar">
                {#if getAvatarUrl(persona)}
                    <img src={getAvatarUrl(persona)} alt={persona.name} />
                {:else}
                    <svg><!-- person icon --></svg>
                {/if}
            </div>
            <div class="persona-info__details">
                <h3 class="persona-info__name">{persona.name}</h3>
                {#if persona.pronouns}
                    <span class="persona-info__pronouns">{persona.pronouns}</span>
                {/if}
                {#if persona.description}
                    <p class="persona-info__description">{persona.description}</p>
                {/if}
                <div class="persona-info__meta">
                    <span>Created {formatDate(persona.created_at)}</span>
                    <span>Updated {formatDate(persona.updated_at)}</span>
                </div>
            </div>
        </div>

        <!-- Appearance section -->
        {#if persona.appearance}
            <div class="persona-info__section">
                <h3 class="persona-info__section-title">Appearance</h3>
                <p class="persona-info__section-text">{persona.appearance}</p>
            </div>
        {/if}

        <!-- Personality section -->
        {#if persona.personality}
            <div class="persona-info__section">
                <h3 class="persona-info__section-title">Personality</h3>
                <p class="persona-info__section-text">{persona.personality}</p>
            </div>
        {/if}
    </div>

    {#snippet footer()}
        <div class="persona-info__footer">
            <DeleteConfirmButton
                label="Delete this persona?"
                onconfirm={handleDelete}
                disabled={deleting}
            />
            <div class="persona-info__footer-right">
                <button class="modal__btn--ghost" onclick={handleEdit}>
                    <svg><!-- pencil icon --></svg>
                    Edit
                </button>
                <button class="modal__btn modal__btn--primary" onclick={closePersonaInfoModal}>
                    Done
                </button>
            </div>
        </div>
    {/snippet}
</Modal>
```

**Style section:** Match `persona-card-view.html` CSS classes, using Playime design tokens.

**Verification:** Clicking a persona card opens this modal with correct data.

### Step 5: PersonaFormModal.svelte — create/edit form

**New file:** `frontend/src/lib/components/chat/PersonaFormModal.svelte`

Based on `persona-card-edit.html`:

**Script section:**
- Import `Modal` from `./Modal.svelte`
- Import `chat`, `closePersonaFormModal`, `loadPersonas` from `chat.svelte`
- Import `createPersona`, `updatePersona`, `uploadAvatar`, `resolveFileUrl` from `$lib/api/chat`
- Import `CreatePersonaInput`, `UpdatePersonaInput`, `ApiPersona` from `$lib/api/chat`
- Props: `mode: 'create' | 'edit'`, `persona?: ApiPersona`
- Form state: `name`, `pronouns`, `description`, `appearance`, `personality` (all `$state`)
- Avatar state: `avatarPreview`, `avatarFile`, `avatarRemoved`, `fileInput`
- Pronouns state: `selectedPronouns` (one of 'they/them' | 'she/her' | 'he/him' | 'custom'), `customPronouns`
- Validation: `canSave = name.trim().length > 0 && !saving`
- `saving` state for disabled button

**Avatar handling:**
- `handleAvatarClick()` → triggers file input
- `handleAvatarChange(e)` → reads file, sets preview
- `handleRemoveAvatar()` → clears preview/file/removed flag
- In edit mode: shows current avatar via `resolveFileUrl(persona?.avatar ?? persona?.avatar_file)`

**Pronouns handling:**
- Button group: they/them, she/her, he/him, custom
- Clicking a button sets `selectedPronouns`
- When 'custom' is selected, show a text input for free-form entry
- When a preset is selected, `pronouns` = that value
- When 'custom' is selected, `pronouns` = customPronouns text

**Save flow:**
```ts
async function handleSave(): Promise<void> {
    if (!canSave) return;
    saving = true;
    try {
        const pronounsValue = selectedPronouns === 'custom' ? customPronouns.trim() : selectedPronouns;
        if (mode === 'create') {
            const input: CreatePersonaInput = {
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                ...(appearance.trim() ? { appearance: appearance.trim() } : {}),
                ...(personality.trim() ? { personality: personality.trim() } : {}),
                ...(pronounsValue ? { pronouns: pronounsValue } : {}),
            };
            const result = await createPersona(input);
            if (result && avatarFile) {
                await uploadAvatar('personas', result.id, avatarFile);
            }
        } else {
            const input: UpdatePersonaInput = {
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                ...(appearance.trim() ? { appearance: appearance.trim() } : {}),
                ...(personality.trim() ? { personality: personality.trim() } : {}),
                ...(pronounsValue ? { pronouns: pronounsValue } : {}),
            };
            const result = await updatePersona(persona!.id, input);
            if (result && avatarFile) {
                await uploadAvatar('personas', result.id, avatarFile);
            } else if (result && avatarRemoved) {
                await updatePersona(persona!.id, { avatar: null });
            }
        }
        await loadPersonas();
        closePersonaFormModal();
    } catch {
        // show error
    } finally {
        saving = false;
    }
}
```

**Template:**
```svelte
<Modal title={mode === 'create' ? 'Create Persona' : 'Edit Persona'} onclose={closePersonaFormModal}>
    <div class="persona-form">
        <!-- Avatar picker -->
        <div class="modal__field">
            <label class="modal__label">Avatar</label>
            <div class="modal__avatar-area">
                <div class="modal__avatar-picker" onclick={handleAvatarClick}>
                    {#if avatarPreview}
                        <img src={avatarPreview} alt="Avatar" class="modal__avatar-img" />
                    {:else}
                        <svg><!-- camera icon --></svg>
                        <span class="modal__avatar-text">Click to upload</span>
                    {/if}
                </div>
                <div class="modal__avatar-hint">
                    <span class="modal__avatar-hint-title">Profile picture</span>
                    <span class="modal__avatar-hint-text">Recommended: 512×512px or larger. PNG, JPG, or WebP.</span>
                </div>
            </div>
            {#if avatarPreview}
                <button class="modal__avatar-remove" onclick={handleRemoveAvatar}>×</button>
            {/if}
            <input bind:this={fileInput} type="file" accept="image/*" class="modal__file-input" onchange={handleAvatarChange} />
        </div>

        <!-- Name -->
        <div class="modal__field">
            <label class="modal__label" for="persona-name">Name <span class="modal__required">*</span></label>
            <input id="persona-name" class="modal__input" type="text" placeholder="Your character's name" bind:value={name} />
        </div>

        <!-- Pronouns -->
        <div class="modal__field">
            <label class="modal__label">Pronouns <span class="modal__label-optional">(optional)</span></label>
            <div class="pronouns-group">
                {#each pronounOptions as option}
                    <button
                        class="pronouns-btn"
                        class:pronouns-btn--active={selectedPronouns === option}
                        onclick={() => selectedPronouns = option}
                    >{option}</button>
                {/each}
            </div>
            {#if selectedPronouns === 'custom'}
                <input class="modal__input" type="text" placeholder="Enter custom pronouns" bind:value={customPronouns} />
            {/if}
        </div>

        <!-- Description -->
        <div class="modal__field">
            <label class="modal__label" for="persona-description">Description <span class="modal__label-optional">(optional)</span></label>
            <textarea id="persona-description" class="modal__textarea" rows="3" placeholder="A brief summary of who this persona is" bind:value={description}></textarea>
            <span class="char-count">{description.length} / 500</span>
        </div>

        <!-- Appearance -->
        <div class="modal__field">
            <label class="modal__label" for="persona-appearance">Appearance <span class="modal__label-optional">(optional)</span></label>
            <textarea id="persona-appearance" class="modal__textarea" rows="4" placeholder="How does this persona look?" bind:value={appearance}></textarea>
        </div>

        <!-- Personality -->
        <div class="modal__field">
            <label class="modal__label" for="persona-personality">Personality <span class="modal__label-optional">(optional)</span></label>
            <textarea id="persona-personality" class="modal__textarea" rows="4" placeholder="Key personality traits, behaviors, and quirks" bind:value={personality}></textarea>
        </div>
    </div>

    {#snippet footer()}
        <div class="modal__footer-buttons">
            <button class="modal__btn modal__btn--cancel" onclick={closePersonaFormModal}>Cancel</button>
            <button class="modal__btn modal__btn--save" disabled={!canSave} onclick={handleSave}>
                {saving ? 'Saving...' : 'Save'}
            </button>
        </div>
    {/snippet}
</Modal>
```

**Style section:** Match `persona-card-edit.html` CSS, using Playime design tokens.

**Verification:** Create and edit personas through the form, confirm round-trip to backend.

### Step 6: Wire routing and layout

**File:** `frontend/src/routes/+page.svelte`

1. Import `Personas` component
2. Add branch:
   ```svelte
   {:else if nav.activeView === 'my-titles'}
       <Personas />
   ```

**File:** `frontend/src/routes/+layout.svelte`

1. Import `PersonaInfoModal` and `PersonaFormModal`
2. Import `closePersonaInfoModal`, `closePersonaFormModal` from `chat.svelte`
3. Add modal renders:
   ```svelte
   {#if chat.personaInfoModal}
       <PersonaInfoModal persona={chat.personaInfoModal.persona} />
   {/if}

   {#if chat.personaFormModal}
       <PersonaFormModal
           mode={chat.personaFormModal.mode}
           persona={chat.personaFormModal.persona}
       />
   {/if}
   ```

**Verification:** Navigation to Personas view works, modals open/close correctly.

### Step 7: Verification

1. **Fetch round-trip:** Create a persona via backend (or existing data), confirm it appears on Personas page after fresh load
2. **Empty state:** Zero personas → "No personas yet" empty state renders
3. **Error state:** Stop backend → reload → error + Retry UI
4. **Create:** Click "New" → fill form → Save → persona appears in grid
5. **Edit:** Click card → info modal → Edit → form modal pre-filled → Save → changes persist
6. **Delete:** Click card → info modal → Delete → confirm → persona removed from grid
7. **Avatar:** Upload avatar → preview shows → Save → avatar persists on reload
8. **New Play picker:** Open CardInfoModal → persona picker still lists all personas correctly
9. **Pronouns:** Button group works, custom option shows text input
10. **Character count:** Description field shows live count, turns red at 500+
