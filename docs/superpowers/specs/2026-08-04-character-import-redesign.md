# Character Import Flow Redesign

**Date:** 2026-08-04  
**Status:** Approved  
**Scope:** Frontend modal refactoring + backend parse endpoint

---

## Problem Statement

1. The "Upload" button should be renamed to "Import" for clarity
2. Current import flow directly creates a card from the file, bypassing user review
3. PNG import doesn't extract the image itself as the avatar

## Goals

- Rename "Upload" to "Import" in the character grid
- Change import flow: parse file → open character creation form with pre-filled data → user reviews/edits → save
- Fix PNG import to use the PNG image as the avatar

## Architecture

### Current Flow
```
User clicks "Upload" → ImportCardModal → File parsed → POST /api/cards/import → Card created → Modal closes
```

### New Flow
```
User clicks "Import" → ImportCardModal → File parsed → POST /api/cards/parse → onparsed callback → CharacterFormModal opens with pre-filled data → User reviews/edits → Save
```

---

## Implementation Details

### 1. Button Rename (CharacterGrid.svelte)

Change the "Upload" button text to "Import":
```svelte
<button class="action-btn" onclick={openImportCardModal}>
    <svg ...>...</svg>
    <span>Import</span>
</button>
```

### 2. State Management (chat.svelte.ts)

Extend the existing `characterFormModal` state to carry imported data:

```typescript
// Extend the characterFormModal state type
chat.characterFormModal = {
    mode: 'create',
    importedData: data,  // NEW: carries parsed import data
};
```

Modify `openImportCardModal` to accept `onparsed` callback:
```typescript
export function openImportCardModal(onparsed: (data: Partial<CreateCardInput>) => void): void {
    chat.importCardModal = { onparsed };
}
```

**Note:** The `+layout.svelte` must pass the `onparsed` callback to `ImportCardModal` when rendering it.

### 3. ImportCardModal Refactor

**Changes:**
- Change callback signature from `onimported: (card: ApiCharacterCard) => void` to `onparsed: (data: Partial<CreateCardInput>) => void`
- Both PNG and JSON files are sent to the new `/api/cards/parse` endpoint for consistent parsing
- Update modal title to "Import Character Data"
- Update dropzone label to "Drag & drop or click to import"

**File reading logic:**
```typescript
function importFile(file: File): Promise<void> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUri = reader.result as string;
            
            // Check file type to determine how to send
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                // JSON: parse and send object directly
                try {
                    const jsonStr = atob(dataUri.split(',')[1] ?? '');
                    const parsed = JSON.parse(jsonStr);
                    await sendParse(parsed);
                } catch {
                    errorMessage = 'Failed to parse JSON file.';
                }
            } else {
                // PNG: send base64 data
                const base64 = dataUri.split(',')[1] ?? '';
                await sendParse({ data: base64 });
            }
            resolve();
        };
        reader.onerror = () => {
            errorMessage = 'Failed to read the file.';
            resolve();
        };
        reader.readAsDataURL(file);
    });
}
```

**Parse endpoint call:**
```typescript
async function sendParse(body: unknown): Promise<void> {
    errorMessage = '';
    importing = true;
    try {
        const res = await fetch(`${BASE}/api/cards/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            let message = `Import failed (HTTP ${res.status})`;
            try {
                const errBody = await res.json() as { error?: { message?: string } };
                if (errBody.error?.message) message = errBody.error.message;
            } catch { /* non-JSON error body */ }
            errorMessage = message;
            return;
        }
        const data = (await res.json()) as Partial<CreateCardInput>;
        onparsed(data);
    } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Network error — could not reach the server.';
    } finally {
        importing = false;
    }
}
```

**JSON paste flow (kept):**
```typescript
function importJsonText(): void {
    const text = jsonText.trim();
    if (!text) {
        errorMessage = 'Please paste some JSON text first.';
        return;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        sendParse(parsed);
    } catch {
        errorMessage = 'Invalid JSON — could not parse the pasted text.';
    }
}
```

### 4. Backend Parse Endpoint

**New endpoint: `POST /api/cards/parse`**

Location: `backend/src/routes/character.ts`

This unified endpoint handles both PNG and JSON imports:
- **PNG**: `{ "data": "<base64 PNG>" }` - extracts card data from tEXt chunks, uses PNG as avatar
- **JSON**: Card JSON object directly - parses using SillyTavern normalizer

```typescript
app.post('/api/cards/parse', {
    schema: {
        body: {
            type: 'object',
            properties: {
                data: { type: 'string' },  // For PNG: base64 data
            },
            additionalProperties: true,  // For JSON: card object passed directly
        },
    },
}, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    
    let rawJson: Record<string, unknown> | null = null;
    let avatarDataUri: string | null = null;
    
    try {
        // Case 1: PNG import (body has `data` field with base64)
        if (typeof body['data'] === 'string') {
            const decoded = Buffer.from(body['data'] as string, 'base64');
            
            // Validate PNG signature
            const isPng = decoded.length > 8 &&
                decoded[0] === 0x89 && decoded[1] === 0x50 &&
                decoded[2] === 0x4e && decoded[3] === 0x47;
            
            if (!isPng) {
                return reply.code(400).send({
                    error: { code: 'invalid_data', message: 'Data is not a valid PNG file' },
                });
            }
            
            // Extract card JSON from tEXt chunks
            const jsonStr = extractCardJsonFromPng(decoded);
            if (!jsonStr) {
                return reply.code(400).send({
                    error: { code: 'no_card_data', message: 'PNG does not contain character card data' },
                });
            }
            
            rawJson = JSON.parse(jsonStr);
            avatarDataUri = `data:image/png;base64,${body['data']}`;
        }
        // Case 2: JSON import (body IS the card object)
        else if (typeof body['name'] === 'string' || typeof body['spec'] === 'string') {
            rawJson = body;
        }
        else {
            return reply.code(400).send({
                error: { code: 'invalid_body', message: 'Expected PNG data or card JSON object' },
            });
        }
        
        // Parse using SillyTavern normalizer
        const card = parseSillyTavernCard(rawJson!);
        
        // If we have an avatar from PNG, override the parsed avatar
        if (avatarDataUri) {
            card.avatar = avatarDataUri;
            card.avatars = [{ id: 'default', name: 'Default', image: avatarDataUri }];
        }
        
        return reply.send(card);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse card data';
        return reply.code(400).send({
            error: { code: 'parse_error', message },
        });
    }
});
```

### 5. CharacterFormModal Pre-fill

**New prop:**
```typescript
let {
    mode,
    card,
    importedData,  // NEW
    onclose,
    onsave,
}: {
    mode: 'create' | 'edit';
    card?: ApiCharacterCard;
    importedData?: Partial<CreateCardInput>;  // NEW
    onclose: () => void;
    onsave: (card: ApiCharacterCard) => void;
};
```

**Initialize form fields from importedData:**
```typescript
let name = $state(importedData?.name ?? card?.name ?? '');
let tagline = $state(importedData?.tagline ?? card?.tagline ?? '');
let description = $state(importedData?.description ?? card?.description ?? '');
let personality = $state(importedData?.personality ?? card?.personality ?? '');
let speechStyle = $state(importedData?.speech_style ?? card?.speech_style ?? '');
let likesAndDislikes = $state(importedData?.likes_and_dislikes ?? card?.likes_and_dislikes ?? '');
let scenario = $state(importedData?.scenario ?? card?.scenario ?? '');
let firstMessage = $state(importedData?.first_message ?? card?.first_message ?? '');

// Avatar
let avatarPreview = $state<string | null>(
    importedData?.avatar ?? card?.avatar ?? null
);
```

**Update modal title:**
```svelte
<h2 id="character-form-title" class="modal__header-title">
    {#if importedData}
        Create Character (Imported)
    {:else if mode === 'create'}
        Create Character
    {:else}
        Edit Character
    {/if}
</h2>
```

**Handle save to include ALL imported fields:**
```typescript
if (mode === 'create') {
    // Build base input from form fields
    const baseInput: CreateCardInput = {
        name: name.trim(),
        ...(avatarPreview ? { avatar: avatarPreview } : {}),
        tagline: tagline.trim(),
        personality: personality.trim(),
        speech_style: speechStyle.trim(),
        likes_and_dislikes: likesAndDislikes.trim(),
        scenario: scenario.trim(),
        ...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
    };
    
    // Merge with imported fields that aren't in the form
    // This ensures all imported data is preserved
    const input: CreateCardInput = {
        ...baseInput,
        // Pass through all imported fields that aren't form-editable
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
        ...(importedData?.alternate_greetings ? { alternate_greetings: importedData.alternate_greetings } : {}),
        ...(importedData?.starting_scenarios ? { starting_scenarios: importedData.starting_scenarios } : {}),
        ...(importedData?.default_persona ? { default_persona: importedData.default_persona } : {}),
    };
    
    result = await saveCard('create', input);
}
```

### 6. +layout.svelte Wiring

The `+layout.svelte` must be updated to pass the `onparsed` callback to `ImportCardModal`:

```svelte
{#if chat.importCardModal}
    <ImportCardModal
        onclose={() => { chat.importCardModal = null; }}
        onparsed={(data) => {
            chat.importCardModal = null;
            chat.characterFormModal = { mode: 'create', importedData: data };
        }}
    />
{/if}

{#if chat.characterFormModal}
    <CharacterFormModal
        mode={chat.characterFormModal.mode}
        card={chat.characterFormModal.card}
        importedData={chat.characterFormModal.importedData}
        onclose={() => { chat.characterFormModal = null; }}
        onsave={(card) => {
            chat.characterFormModal = null;
            // refresh card list
        }}
    />
{/if}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/lib/components/chat/CharacterGrid.svelte` | Rename "Upload" to "Import" |
| `frontend/src/lib/components/chat/ImportCardModal.svelte` | Change callback to `onparsed`, use unified `/api/cards/parse` endpoint, update dropzone label |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Add `importedData` prop, pre-fill form fields |
| `frontend/src/lib/state/chat.svelte.ts` | Extend `characterFormModal` state type to include `importedData` |
| `frontend/src/routes/+layout.svelte` | Wire `onparsed` callback to open CharacterFormModal with imported data |
| `backend/src/routes/character.ts` | Add `/api/cards/parse` endpoint (unified PNG/JSON) |

---

## Testing

1. **JSON Import (file):** Import a JSON character file → form opens with pre-filled data → save creates new card
2. **JSON Import (paste):** Paste JSON text → form opens with pre-filled data → save creates new card
3. **PNG Import:** Import a PNG character card → form opens with data + avatar from PNG → save creates new card with avatar
4. **Edit after Import:** Imported data can be modified before saving
5. **Cancel:** Canceling import doesn't create any card
6. **Invalid Files:** Invalid PNG/JSON shows appropriate error messages

---

## Out of Scope

- Modifying the existing `/api/cards/import` endpoint (kept for backward compatibility)
- Batch import functionality
- Import preview/validation before opening form
