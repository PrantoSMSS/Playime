# Character Editing + Avatar Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add character card editing, normalize avatar uploads to PNG via sharp, and harden the upload endpoint with validation.

**Architecture:** Backend gets sharp for image conversion + upload validation. Frontend switches from data URL uploads to FormData multipart. CardInfoModal gets an Edit button. CharacterFormModal handles both create and edit with full avatar management. All state stays centralized in `chat.svelte.ts`.

**Tech Stack:** Node.js, TypeScript, Fastify, sharp, SvelteKit, @fastify/multipart

## Global Constraints

- Avatar files always stored as PNG in `data/entities/characters/{id}/`
- PATCH = partial update only (existing behavior, do not change)
- Do NOT add `advanced_data` — explicit columns + `extensions` catch-all
- Do NOT redesign import pipeline — already correct
- Do NOT break SillyTavern/TavernAI compatibility
- Existing imported Character Cards and conversations must continue working
- CharacterGrid is presentation-only — all actions through centralized state

---

## File Map

### Backend

| File | Action | Responsibility |
|---|---|---|
| `backend/package.json` | Modify | Add `sharp` dependency |
| `backend/src/routes/files.ts` | Modify | Harden upload: MIME check, size limit, sharp conversion, corruption detection |
| `backend/src/routes/character.ts` | Modify | Clear `avatar` column after `saveAvatarLocally()` |

### Frontend

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/api/chat.ts` | Modify | Add `uploadAvatar()` function for FormData upload |
| `frontend/src/lib/components/chat/CardInfoModal.svelte` | Modify | Add Edit button in footer |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Modify | FormData upload, avatar management UI, edit mode preservation |

### No Changes Needed

| File | Reason |
|---|---|
| `backend/src/models/character.ts` | PATCH already partial, all fields exist |
| `frontend/src/lib/state/chat.svelte.ts` | `openEditCardModal` already exists |
| `backend/src/cards/sillytavern.ts` | Import normalization already mature |

---

### Task 1: Install sharp dependency

**Files:**
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `sharp` available via `import sharp from 'sharp'`

- [ ] **Step 1: Install sharp**

Run: `cd backend && npm install sharp`

- [ ] **Step 2: Verify installation**

Run: `cd backend && node -e "import('sharp').then(s => console.log('sharp version:', s.default.versions.sharp))"`

Expected: Prints sharp version number

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "deps: add sharp for image conversion"
```

---

### Task 2: Harden upload endpoint with validation and PNG conversion

**Files:**
- Modify: `backend/src/routes/files.ts` (the `POST /api/upload/:type/:id` handler)

**Interfaces:**
- Consumes: `sharp` from Task 1, `@fastify/multipart` (already registered)
- Produces: Upload endpoint that validates MIME, checks size, converts to PNG, returns `{ filename, path }`

- [ ] **Step 1: Add sharp import and validation constants**

At the top of `files.ts`, add:

```typescript
import sharp from 'sharp';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 2048;
const ALLOWED_MIME_PREFIXES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
```

- [ ] **Step 2: Replace the upload handler body**

Replace the entire `POST /api/upload/:type/:id` handler with:

```typescript
app.post<{
  Params: { type: string; id: string };
}>('/api/upload/:type/:id', async (request, reply) => {
  const { type, id } = request.params;

  if (!ENTITY_TYPES.includes(type as EntityType)) {
    return reply.code(400).send({
      error: { code: 'invalid_type', message: 'Invalid entity type' },
    });
  }

  const data = await request.file();
  if (!data) {
    return reply.code(400).send({
      error: { code: 'no_file', message: 'No file uploaded' },
    });
  }

  // Validate MIME type
  const mimetype = data.mimetype;
  if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix))) {
    return reply.code(400).send({
      error: { code: 'invalid_mime', message: 'Only image files are accepted' },
    });
  }

  // Collect file buffer and check size
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of data.file) {
    totalSize += chunk.length;
    if (totalSize > MAX_UPLOAD_SIZE) {
      return reply.code(400).send({
        error: { code: 'file_too_large', message: 'Image must be under 10MB' },
      });
    }
    chunks.push(chunk);
  }
  const inputBuffer = Buffer.concat(chunks);

  // Decode with sharp (validates not corrupted), resize if needed, convert to PNG
  let outputBuffer: Buffer;
  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // Resize if either dimension exceeds max (preserve aspect ratio)
    if (
      metadata.width && metadata.width > MAX_DIMENSION ||
      metadata.height && metadata.height > MAX_DIMENSION
    ) {
      image.resize({
        width: metadata.width && metadata.width > MAX_DIMENSION ? MAX_DIMENSION : undefined,
        height: metadata.height && metadata.height > MAX_DIMENSION ? MAX_DIMENSION : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    outputBuffer = await image.png().toBuffer();
  } catch {
    return reply.code(400).send({
      error: { code: 'corrupt_image', message: 'File is not a valid image' },
    });
  }

  // Save to entity directory
  const entityDir = ensureEntityDir(type as EntityType, id);
  const filePath = join(entityDir, 'avatar.png');
  writeFileSync(filePath, outputBuffer);

  const relativePath = `${type}/${id}/avatar.png`;
  return { filename: 'avatar.png', path: relativePath };
});
```

- [ ] **Step 3: Add writeFileSync import**

Add `writeFileSync` to the existing fs import at the top of `files.ts`:

```typescript
import { accessSync, createReadStream, statSync, writeFileSync } from 'node:fs';
```

- [ ] **Step 4: Test the hardened upload endpoint manually**

Start the server, then test with curl:

```bash
# Test valid PNG upload
curl -X POST http://127.0.0.1:3000/api/upload/characters/char_yehwa_0001 \
  -F "file=@test_files/test.png;type=image/png"

# Test invalid MIME (should fail)
echo "not an image" > /tmp/fake.txt
curl -X POST http://127.0.0.1:3000/api/upload/characters/char_yehwa_0001 \
  -F "file=@/tmp/fake.txt;type=text/plain"
```

Expected: PNG returns `{ filename: "avatar.png", path: "characters/char_yehwa_0001/avatar.png" }`. Text file returns 400 with `invalid_mime`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/files.ts
git commit -m "feat: harden upload endpoint with MIME validation, size limits, and PNG conversion"
```

---

### Task 3: Clear avatar column after saveAvatarLocally

**Files:**
- Modify: `backend/src/routes/character.ts` (create, update, and import routes)

**Interfaces:**
- Consumes: `updateCharacterCard()` from `models/character.ts`
- Produces: Avatar column set to `null` after filesystem save succeeds

- [ ] **Step 1: Fix the create route**

In the `POST /api/cards` handler, find the line:

```typescript
updateCharacterCard(card.id, { avatar_file: avatarFile, avatars });
```

Replace with:

```typescript
updateCharacterCard(card.id, { avatar_file: avatarFile, avatars, avatar: null });
```

- [ ] **Step 2: Fix the import route**

In the `POST /api/cards/import` handler, find:

```typescript
updateCharacterCard(created.id, { avatar_file: avatarFile, avatars });
```

Replace with:

```typescript
updateCharacterCard(created.id, { avatar_file: avatarFile, avatars, avatar: null });
```

- [ ] **Step 3: Fix the update route**

In the `PATCH /api/cards/:id` handler, find:

```typescript
updateCharacterCard(id, { avatar_file: avatarFile, avatars });
```

Replace with:

```typescript
updateCharacterCard(id, { avatar_file: avatarFile, avatars, avatar: null });
```

- [ ] **Step 4: Verify all three routes updated**

Run: `grep -n "avatar_file: avatarFile" backend/src/routes/character.ts`

Expected: Three matches, all showing `{ avatar_file: avatarFile, avatars, avatar: null }`

- [ ] **Step 5: Run existing tests**

Run: `cd backend && npm test`

Expected: All tests pass (no test changes needed — existing tests don't check the avatar column value)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/character.ts
git commit -m "fix: clear avatar column after filesystem save to eliminate dual-source ambiguity"
```

---

### Task 4: Add uploadAvatar function to frontend API client

**Files:**
- Modify: `frontend/src/lib/api/chat.ts`

**Interfaces:**
- Consumes: `BASE` URL constant, `ApiError` class (already defined)
- Produces: `uploadAvatar(entityType, entityId, file): Promise<{ filename: string; path: string }>`

- [ ] **Step 1: Add the uploadAvatar function**

Add after the `deleteCard` function (around line 371):

```typescript
/** Upload an image file to the entity storage. Returns the saved filename and relative path. */
export async function uploadAvatar(
  entityType: string,
  entityId: string,
  file: File,
): Promise<{ filename: string; path: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}/api/upload/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { filename: string; path: string };
}
```

- [ ] **Step 2: Verify the function compiles**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

Expected: No errors related to `uploadAvatar`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/chat.ts
git commit -m "feat: add uploadAvatar function for multipart file upload"
```

---

### Task 5: Add Edit button to CardInfoModal

**Files:**
- Modify: `frontend/src/lib/components/chat/CardInfoModal.svelte`

**Interfaces:**
- Consumes: `openEditCardModal` from `$lib/state/chat.svelte` (already exported)
- Produces: Edit button in the modal footer that opens CharacterFormModal in edit mode

- [ ] **Step 1: Import openEditCardModal**

In the `<script>` section, add `openEditCardModal` to the existing import:

```typescript
import { chat, removeCard, closeCardInfoModal, openEditCardModal } from '$lib/state/chat.svelte';
```

- [ ] **Step 2: Add onedit prop**

Update the props to include an `onedit` callback:

```typescript
let {
  card,
  onclose,
  onstartplay,
  onedit,
}: {
  card: ApiCharacterCard;
  onclose: () => void;
  onstartplay: (selections: {
    personaId?: string;
    personaSource?: 'default' | 'custom';
    playerName?: string;
    startingScenarioId?: string;
  }) => void;
  onedit: (card: ApiCharacterCard) => void;
} = $props();
```

- [ ] **Step 3: Add Edit button in the footer**

In the `modal__footer-right` div, add the Edit button before the Export wrapper:

```svelte
<div class="modal__footer-right">
  <!-- Edit button -->
  <button
    class="modal__edit-btn"
    onclick={() => onedit(card)}
    aria-label="Edit character"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    Edit
  </button>

  <!-- Export dropdown (existing) -->
  ...
</div>
```

- [ ] **Step 4: Add Edit button styles**

Add these styles in the `<style>` section, after the delete button styles:

```css
/* Edit button */
.modal__edit-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}
.modal__edit-btn:hover {
  color: var(--text);
  border-color: var(--text-muted);
  background: var(--bg-raised);
}
```

- [ ] **Step 5: Wire the onedit callback in layout**

In `frontend/src/routes/+layout.svelte`, update the CardInfoModal usage:

```svelte
{#if chat.cardInfoModal}
  <CardInfoModal
    card={chat.cardInfoModal.card}
    onclose={closeCardInfoModal}
    onstartplay={startNewPlay}
    onedit={(card) => openEditCardModal(card)}
  />
{/if}
```

Import `openEditCardModal` in the layout script:

```typescript
import {
  chat, closeCardInfoModal, startNewPlay, openEditCardModal,
  closeCharacterFormModal, closeImportCardModal, loadCards, loadSessions,
} from '$lib/state/chat.svelte';
```

- [ ] **Step 6: Verify compilation**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/components/chat/CardInfoModal.svelte frontend/src/routes/+layout.svelte
git commit -m "feat: add Edit button to CardInfoModal footer"
```

---

### Task 6: Update CharacterFormModal for edit mode with FormData upload

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterFormModal.svelte`

**Interfaces:**
- Consumes: `uploadAvatar` from Task 4, `resolveFileUrl` (existing), `saveCard` (existing)
- Produces: Modal that uploads via FormData, handles avatar management, preserves untouched fields in edit mode

- [ ] **Step 1: Import uploadAvatar**

Add to the existing imports:

```typescript
import { uploadAvatar, resolveFileUrl } from '$lib/api/chat';
```

- [ ] **Step 2: Add avatar state variables**

After the existing `avatarPreview` state, add:

```typescript
let avatarFile = $state<File | null>(null);
let uploading = $state(false);
```

- [ ] **Step 3: Update handleAvatarChange to capture the File object**

Replace the existing `handleAvatarChange`:

```typescript
function handleAvatarChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Store the File object for upload
  avatarFile = file;

  // Show preview via object URL (not data URL)
  avatarPreview = URL.createObjectURL(file);
  // Reset so the same file can be re-selected
  input.value = '';
}
```

- [ ] **Step 4: Update handleRemoveAvatar to clean up**

```typescript
function handleRemoveAvatar(): void {
  if (avatarPreview && avatarPreview.startsWith('blob:')) {
    URL.revokeObjectURL(avatarPreview);
  }
  avatarPreview = null;
  avatarFile = null;
  if (fileInput) fileInput.value = '';
}
```

- [ ] **Step 5: Rewrite handleSave for FormData upload**

Replace the entire `handleSave` function:

```typescript
async function handleSave(): Promise<void> {
  if (!canSave) return;

  saving = true;
  errorMessage = null;

  try {
    let result: ApiCharacterCard | null;

    if (mode === 'create') {
      // Create card first (without avatar)
      const createInput: CreateCardInput = {
        name: name.trim(),
        tagline: tagline.trim(),
        personality: personality.trim(),
        speech_style: speechStyle.trim(),
        likes_and_dislikes: likesAndDislikes.trim(),
        scenario: scenario.trim(),
        ...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        // Pass through imported fields
        ...(importedData?.alternate_greetings ? { alternate_greetings: importedData.alternate_greetings } : {}),
        ...(importedData?.world_info ? { world_info: importedData.world_info } : {}),
        ...(importedData?.extensions ? { extensions: importedData.extensions } : {}),
        ...(importedData?.tags ? { tags: importedData.tags } : {}),
        ...(importedData?.creator ? { creator: importedData.creator } : {}),
        ...(importedData?.creator_notes ? { creator_notes: importedData.creator_notes } : {}),
        ...(importedData?.creator_name ? { creator_name: importedData.creator_name } : {}),
        ...(importedData?.character_version ? { character_version: importedData.character_version } : {}),
        ...(importedData?.system_prompt ? { system_prompt: importedData.system_prompt } : {}),
        ...(importedData?.post_history_instructions ? { post_history_instructions: importedData.post_history_instructions } : {}),
        ...(importedData?.mes_example ? { mes_example: importedData.mes_example } : {}),
        ...(importedData?.starting_scenarios ? { starting_scenarios: importedData.starting_scenarios } : {}),
        ...(importedData?.default_persona ? { default_persona: importedData.default_persona } : {}),
      };

      result = await saveCard('create', createInput);

      // Upload avatar if one was selected
      if (result && avatarFile) {
        uploading = true;
        try {
          const { path } = await uploadAvatar('characters', result.id, avatarFile);
          result = await saveCard('edit', { avatar: path }, result.id);
        } finally {
          uploading = false;
        }
      }
    } else {
      // Edit mode: only send fields the form controls
      const updateInput: UpdateCardInput = {
        name: name.trim(),
        tagline: tagline.trim(),
        personality: personality.trim(),
        speech_style: speechStyle.trim(),
        likes_and_dislikes: likesAndDislikes.trim(),
        scenario: scenario.trim(),
        ...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      };

      result = await saveCard('edit', updateInput, card?.id);

      // Upload avatar if one was selected
      if (result && avatarFile) {
        uploading = true;
        try {
          const { path } = await uploadAvatar('characters', result.id, avatarFile);
          result = await saveCard('edit', { avatar: path }, result.id);
        } finally {
          uploading = false;
        }
      }
    }

    if (result) {
      onsave(result);
    } else {
      errorMessage = 'Failed to save. Please try again.';
    }
  } catch {
    errorMessage = 'An unexpected error occurred.';
  } finally {
    saving = false;
  }
}
```

- [ ] **Step 6: Update the file input accept attribute**

Change the file input to explicitly accept common image formats:

```svelte
<input
  id="char-avatar-upload"
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp,image/avif"
  class="modal__file-input"
  onchange={handleAvatarChange}
/>
```

- [ ] **Step 7: Add uploading state to the UI**

In the avatar picker area, show a loading indicator when uploading:

```svelte
{#if avatarPreview}
  <img src={avatarPreview} alt="Avatar preview" class="modal__avatar-img" />
  {#if uploading}
    <div class="modal__avatar-uploading">
      <span>Uploading...</span>
    </div>
  {:else}
    <div class="modal__avatar-overlay">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </div>
  {/if}
{:else}
  ...
{/if}
```

- [ ] **Step 8: Add uploading indicator styles**

```css
.modal__avatar-uploading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: var(--font-size-xs);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 9: Verify compilation**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: update CharacterFormModal with FormData upload and edit mode"
```

---

### Task 7: Add avatar management UI to editor (add/replace/remove)

**Files:**
- Modify: `frontend/src/lib/components/avatar/CharacterFormModal.svelte` (same file as Task 6)

**Interfaces:**
- Consumes: `avatars` state from the card prop, `uploadAvatar` from Task 4
- Produces: Full avatar management — list existing avatars, replace, remove, add new

- [ ] **Step 1: Add avatar list state**

After the existing avatar state variables, add:

```typescript
// Avatar management
let avatars = $state<Array<{ id: string; name?: string; image: string }>>(
  card?.avatars ?? []
);
```

- [ ] **Step 2: Add avatar management handlers**

```typescript
async function handleReplaceAvatar(index: number, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !card) return;

  uploading = true;
  try {
    const { path } = await uploadAvatar('characters', card.id, file);
    const updated = avatars.map((a, i) => i === index ? { ...a, image: path } : a);
    avatars = updated;
    await saveCard('edit', { avatars }, card.id);
  } finally {
    uploading = false;
    input.value = '';
  }
}

function handleRemoveAvatarOption(index: number): void {
  if (!card) return;
  const removed = avatars[index];
  avatars = avatars.filter((_, i) => i !== index);
  // Update DB (file stays on disk for backward compat)
  saveCard('edit', { avatars }, card.id);
}

async function handleAddAvatar(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !card) return;

  uploading = true;
  try {
    const { path } = await uploadAvatar('characters', card.id, file);
    const newAvatar = { id: `avatar_${Date.now()}`, name: file.name, image: path };
    avatars = [...avatars, newAvatar];
    await saveCard('edit', { avatars }, card.id);
  } finally {
    uploading = false;
    input.value = '';
  }
}
```

- [ ] **Step 3: Add avatar management UI in Identity tab**

After the primary avatar picker, add the avatar options list (only in edit mode):

```svelte
{#if mode === 'edit' && avatars.length > 0}
  <div class="modal__field">
    <label class="modal__label">Avatar Options</label>
    <div class="modal__avatar-options">
      {#each avatars as avatar, i (avatar.id)}
        <div class="modal__avatar-option">
          <img src={resolveFileUrl(avatar.image)} alt={avatar.name ?? `Option ${i + 1}`} class="modal__avatar-option-img" />
          <div class="modal__avatar-option-actions">
            <label class="modal__avatar-option-btn" title="Replace">
              <input type="file" accept="image/*" class="modal__file-input-hidden" onchange={(e) => handleReplaceAvatar(i, e)} />
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </label>
            <button class="modal__avatar-option-btn" onclick={() => handleRemoveAvatarOption(i)} title="Remove">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if mode === 'edit'}
  <div class="modal__field">
    <label class="modal__label">
      <span class="modal__avatar-add-btn">
        <input type="file" accept="image/*" class="modal__file-input-hidden" onchange={handleAddAvatar} />
        + Add Avatar
      </span>
    </label>
  </div>
{/if}
```

- [ ] **Step 4: Add avatar options styles**

```css
.modal__avatar-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--space-2);
}
.modal__avatar-option {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
}
.modal__avatar-option-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.modal__avatar-option-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 2px;
  padding: 2px;
  background: rgba(0, 0, 0, 0.6);
  justify-content: center;
}
.modal__avatar-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: transparent;
  color: white;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.modal__avatar-option-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
.modal__avatar-add-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  color: var(--accent);
  border: 1px dashed var(--accent);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.modal__avatar-add-btn:hover {
  background: var(--accent-soft);
}
.modal__file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterFormModal.svelte
git commit -m "feat: add avatar management UI — replace, remove, add options in editor"
```

---

### Task 8: Add CharacterGrid empty and loading states

**Files:**
- Modify: `frontend/src/lib/components/chat/CharacterGrid.svelte`

**Interfaces:**
- Consumes: `chat.cards` (existing state), `chat.loading` (if exists)
- Produces: Empty state UI, loading indicator

- [ ] **Step 1: Read CharacterGrid to understand current structure**

Read `frontend/src/lib/components/chat/CharacterGrid.svelte` to understand the current template and props.

- [ ] **Step 2: Add empty state**

When `chat.cards.length === 0`, show:

```svelte
{#if chat.cards.length === 0}
  <div class="grid__empty">
    <p>No characters yet</p>
    <div class="grid__empty-actions">
      <button class="grid__empty-btn" onclick={onnewclick}>
        + New Character
      </button>
      <button class="grid__empty-btn grid__empty-btn--secondary" onclick={onuploadclick}>
        Import Character Card
      </button>
    </div>
  </div>
{:else}
  <!-- existing card grid -->
{/if}
```

- [ ] **Step 3: Add empty state styles**

```css
.grid__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-8);
  text-align: center;
  color: var(--text-muted);
}
.grid__empty p {
  margin: 0;
  font-size: var(--font-size-base);
}
.grid__empty-actions {
  display: flex;
  gap: var(--space-2);
}
.grid__empty-btn {
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.grid__empty-btn:hover {
  opacity: 0.9;
}
.grid__empty-btn--secondary {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.grid__empty-btn--secondary:hover {
  color: var(--text);
  border-color: var(--text-muted);
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -20`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/components/chat/CharacterGrid.svelte
git commit -m "feat: add CharacterGrid empty state with New and Import buttons"
```

---

### Task 9: Integration test — end-to-end verification

**Files:**
- Test: Manual verification via browser and API

- [ ] **Step 1: Start the server**

Run: `cd backend && npm run dev`

- [ ] **Step 2: Verify upload hardening via curl**

```bash
# Valid PNG
curl -X POST http://127.0.0.1:3000/api/upload/characters/char_yehwa_0001 \
  -F "file=@test_files/test.png;type=image/png"

# Invalid file
echo "not an image" > /tmp/fake.txt
curl -X POST http://127.0.0.1:3000/api/upload/characters/char_yehwa_0001 \
  -F "file=@/tmp/fake.txt;type=text/plain"
```

Expected: PNG succeeds, text file returns 400 with `invalid_mime`

- [ ] **Step 3: Verify avatar column is cleared after create**

```bash
# Create a character with an avatar
curl -X POST http://127.0.0.1:3000/api/cards \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Avatar Clear","avatar":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="}'

# Check the avatar field is null
curl -s http://127.0.0.1:3000/api/cards | python -m json.tool | grep -A2 "Test Avatar Clear"
```

Expected: `avatar` field is `null`, `avatar_file` is `avatar.png`

- [ ] **Step 4: Verify edit preserves untouched fields**

```bash
# Import a card with system_prompt and extensions
curl -X POST http://127.0.0.1:3000/api/cards/import \
  -H "Content-Type: application/json" \
  -d '{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":"Import Test","system_prompt":"Keep me","extensions":{"custom":"data"}}}'

# Edit only the name
curl -X PATCH http://127.0.0.1:3000/api/cards/char_import-test_0001 \
  -H "Content-Type: application/json" \
  -d '{"name":"Import Test Renamed"}'

# Verify system_prompt and extensions survived
curl -s http://127.0.0.1:3000/api/cards/char_import-test_0001 | python -m json.tool | grep -E "system_prompt|extensions"
```

Expected: `system_prompt: "Keep me"` and `extensions: {"custom": "data"}` still present

- [ ] **Step 5: Verify deletion cleans up**

```bash
# Delete the test character
curl -X DELETE http://127.0.0.1:3000/api/cards/char_import-test_0001

# Verify entity folder is removed
ls data/entities/characters/char_import-test_0001/ 2>&1
```

Expected: Directory not found

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && npm test`

Expected: All tests pass

- [ ] **Step 7: Verify frontend in browser**

1. Open http://localhost:5173
2. Click on a character card → CardInfoModal opens
3. Verify Edit button appears between Delete and Export
4. Click Edit → CharacterFormModal opens in edit mode with pre-filled fields
5. Change the name → Save → Card updates, modal closes
6. Click the character again → Click Edit → Verify name persisted, other fields unchanged
7. Try uploading a JPG avatar → Verify it displays correctly
8. Delete a character → Verify empty state shows "No characters yet" with New/Import buttons

---

### Task 10: Final commit

- [ ] **Step 1: Run all tests one final time**

Run: `cd backend && npm test`

- [ ] **Step 2: Check for uncommitted changes**

Run: `git status`

- [ ] **Step 3: Commit any remaining changes**

If there are uncommitted changes from integration testing:

```bash
git add -A
git commit -m "chore: final integration fixes for character editing and avatar normalization"
```

---

## Summary

| Task | What it does | Backend/Frontend |
|---|---|---|
| 1 | Install sharp | Backend |
| 2 | Harden upload endpoint | Backend |
| 3 | Clear avatar column after save | Backend |
| 4 | Add uploadAvatar API function | Frontend |
| 5 | Add Edit button to CardInfoModal | Frontend |
| 6 | Update CharacterFormModal for FormData + edit | Frontend |
| 7 | Add avatar management UI | Frontend |
| 8 | Add CharacterGrid empty state | Frontend |
| 9 | Integration testing | Both |
| 10 | Final commit | Both |
