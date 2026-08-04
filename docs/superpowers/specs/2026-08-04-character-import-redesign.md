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
User clicks "Import" → ImportCardModal → File parsed → POST /api/cards/parse-png (PNG only) → onparsed callback → CharacterFormModal opens with pre-filled data → User reviews/edits → Save
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

Add new state for import flow:
```typescript
interface ChatState {
    // ... existing state
    importedCardData: Partial<CreateCardInput> | null;
}

// New function to handle parsed import data
export function handleImportParsed(data: Partial<CreateCardInput>): void {
    chat.importedCardData = data;
    openCreateCardModal(); // Opens CharacterFormModal
}
```

Modify `openImportCardModal` to accept `onparsed` callback:
```typescript
export function openImportCardModal(onparsed: (data: Partial<CreateCardInput>) => void): void {
    // ... open modal with callback
}
```

### 3. ImportCardModal Refactor

**Changes:**
- Change callback signature from `onimported: (card: ApiCharacterCard) => void` to `onparsed: (data: Partial<CreateCardInput>) => void`
- Both PNG and JSON files are sent to the new `/api/cards/parse` endpoint for consistent parsing
- Update modal title to "Import Character Data"

**Import flow (both PNG and JSON):**
```typescript
async function sendParse(body: unknown): Promise<void> {
    const res = await fetch(`${BASE}/api/cards/parse`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        // handle error
        return;
    }
    const data = await res.json();
    onparsed(data);
}

// For PNG files: send { data: "<base64>" }
// For JSON files: send the parsed JSON object directly
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
        card.avatars = [{ id: 'imported', name: 'Imported', image: avatarDataUri }];
    }
    
    return reply.send(card);
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

**Handle save to include imported fields:**
```typescript
if (mode === 'create') {
    const input: CreateCardInput = {
        name: name.trim(),
        ...(avatarPreview ? { avatar: avatarPreview } : {}),
        tagline: tagline.trim(),
        personality: personality.trim(),
        speech_style: speechStyle.trim(),
        likes_and_dislikes: likesAndDislikes.trim(),
        scenario: scenario.trim(),
        ...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        // Include imported fields that aren't in the form
        ...(importedData?.alternate_greetings ? { alternate_greetings: importedData.alternate_greetings } : {}),
        ...(importedData?.world_info ? { world_info: importedData.world_info } : {}),
        ...(importedData?.extensions ? { extensions: importedData.extensions } : {}),
        ...(importedData?.tags ? { tags: importedData.tags } : {}),
        ...(importedData?.creator ? { creator: importedData.creator } : {}),
        ...(importedData?.creator_notes ? { creator_notes: importedData.creator_notes } : {}),
    };
    result = await saveCard('create', input);
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/lib/components/chat/CharacterGrid.svelte` | Rename "Upload" to "Import" |
| `frontend/src/lib/components/chat/ImportCardModal.svelte` | Change callback to `onparsed`, use unified `/api/cards/parse` endpoint |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Add `importedData` prop, pre-fill form fields |
| `frontend/src/lib/state/chat.svelte.ts` | Add `importedCardData` state, update modal open functions |
| `backend/src/routes/character.ts` | Add `/api/cards/parse` endpoint (unified PNG/JSON) |

---

## Testing

1. **JSON Import:** Import a JSON character file → form opens with pre-filled data → save creates new card
2. **PNG Import:** Import a PNG character card → form opens with data + avatar from PNG → save creates new card with avatar
3. **Edit after Import:** Imported data can be modified before saving
4. **Cancel:** Canceling import doesn't create any card
5. **Invalid Files:** Invalid PNG/JSON shows appropriate error messages

---

## Out of Scope

- Modifying the existing `/api/cards/import` endpoint (kept for backward compatibility)
- Batch import functionality
- Import preview/validation before opening form
