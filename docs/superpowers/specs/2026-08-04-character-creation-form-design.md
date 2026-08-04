# Character Creation Form — Design Spec

**Date:** 2026-08-04
**Status:** Approved
**Checklist item:** Character creation form (frontend) + save/load

## Overview

A modal-based character creation and editing form in the Character tab. Users create new characters via a `[+ New]` button and import existing cards via an `[Upload]` button. The same modal handles both creation and editing (pre-filled when editing).

## User Flow

1. User clicks **Character** in the nav rail → Character tab opens showing a grid of all characters
2. Top-right corner has two buttons: **[+ New]** and **[Upload]**
3. Clicking **[+ New]** opens the **Create Character modal** with empty form fields
4. Clicking **[Upload]** opens the **Import Character Card modal**
5. Clicking any character card in the grid opens the existing **CardInfoModal** → user can play
6. Editing an existing character opens the same Create modal, pre-filled with the card's data

## Component Architecture

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/lib/api/chat.ts` | Modify | Add `createCard()`, `updateCard()`, `deleteCard()` functions |
| `frontend/src/lib/components/chat/CharacterFormModal.svelte` | Create | Tabbed create/edit form modal |
| `frontend/src/lib/components/chat/ImportCardModal.svelte` | Create | Upload/import character card modal |
| `frontend/src/lib/components/chat/CharacterGrid.svelte` | Create | Grid of character cards with [New] and [Upload] buttons |
| `frontend/src/routes/+page.svelte` | Modify | Replace placeholder with CharacterGrid |
| `frontend/src/lib/state/chat.svelte.ts` | Modify | Add character CRUD state management |

### API Client (`$lib/api/chat.ts`)

Add three new functions mapping to existing backend routes:

```ts
interface CreateCardInput {
  name: string;              // required
  avatar?: string | null;
  tagline?: string;
  personality?: string;
  speech_style?: string;
  likes_and_dislikes?: string;
  scenario?: string;
  first_message?: string;
  description?: string;
  tags?: string[];
  // Other optional fields omitted from form but available via import
}

interface UpdateCardInput {
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

createCard(input: CreateCardInput): Promise<ApiCharacterCard>
  → POST /api/cards

updateCard(id: string, patch: UpdateCardInput): Promise<ApiCharacterCard>
  → PATCH /api/cards/:id

deleteCard(id: string): Promise<void>
  → DELETE /api/cards/:id
```

Avatar is sent as a base64 data URI string — the backend already handles this format.

### CharacterFormModal.svelte

A tabbed modal for creating and editing characters. Shared between both flows.

**Props:**
```ts
{
  mode: 'create' | 'edit';
  card?: ApiCharacterCard;  // provided in edit mode
  onclose: () => void;
  onsave: (card: ApiCharacterCard) => void;
}
```

**Tab structure:**

**Tab 1 — Identity**
- Avatar picker (click-to-upload image area, 160×160)
- Name (required, text input)
- Tagline (text input)
- Description (textarea)

**Tab 2 — Personality**
- Personality (textarea)
- Speech Style (textarea)
- Likes & Dislikes (textarea)

**Tab 3 — Scenario**
- Scenario (textarea)
- First Message (textarea)

**Footer:**
- Cancel button (closes modal)
- Save button (calls `createCard` or `updateCard`, then `onsave` callback)

**Behavior:**
- In create mode: all fields empty, Save calls `POST /api/cards`
- In edit mode: fields pre-filled from `card` prop, Save calls `PATCH /api/cards/:id`
- Avatar upload: `FileReader.readAsDataURL()` → stores as base64 string
- On save success: modal closes, parent refreshes character list
- On save error: show error message, modal stays open

### ImportCardModal.svelte

A modal for importing character cards from PNG or JSON files.

**Props:**
```ts
{
  onclose: () => void;
  onimported: (card: ApiCharacterCard) => void;
}
```

**Layout:**
- Drop zone / click-to-upload area for `.png` and `.json` files
- Text area for pasting card JSON directly
- Cancel and Import buttons

**Behavior:**
- File selected: read as base64, send to `POST /api/cards/import` with `{ data: "<base64>" }`
- JSON paste: send directly to `POST /api/cards/import` with the card JSON as body
- On success: close modal, refresh character list
- On error: show error message in the modal

### CharacterGrid.svelte

A grid layout showing all character cards.

**Props:**
```ts
{
  cards: ApiCharacterCard[];
  oncardclick: (card: ApiCharacterCard) => void;
  onnewclick: () => void;
  onuploadclick: () => void;
}
```

**Layout:**
- Header bar with title "Character" and two buttons: `[+ New]` and `[Upload]`
- Responsive grid of character cards (image, name, tagline)
- Each card is clickable → opens CardInfoModal

### State Management (`chat.svelte.ts`)

Add to the `chat` state object:

```ts
/** All loaded character cards. */
cards: [] as ApiCharacterCard[],
```

Add functions:

```ts
/** Load all character cards from the backend. */
async function loadCards(): Promise<void>

/** Create a new card, add to state, return it. */
async function createCard(input: CreateCardInput): Promise<ApiCharacterCard>

/** Update a card, refresh in state, return it. */
async function updateCard(id: string, patch: UpdateCardInput): Promise<ApiCharacterCard>

/** Delete a card, remove from state. */
async function deleteCard(id: string): Promise<void>
```

### Page Integration (`+page.svelte`)

The main page renders the CharacterGrid with the card list from state. Modal visibility is tracked in state:

```ts
/** Character form modal state. */
characterFormModal: null as {
  mode: 'create' | 'edit';
  card?: ApiCharacterCard;
} | null,

/** Import card modal visibility. */
importCardModal: false as boolean,
```

When a card is clicked in the grid, `chat.cardInfoModal` is set (existing flow). When `[+ New]` is clicked, `chat.characterFormModal = { mode: 'create' }`. When `[Upload]` is clicked, `chat.importCardModal = true`.

## CharacterCard Fields Exposed in Form

| Field | Tab | Input type | Required |
|-------|-----|------------|----------|
| `avatar` | Identity | Image upload (click-to-upload area) | No |
| `name` | Identity | Text input | Yes |
| `tagline` | Identity | Text input | No |
| `description` | Identity | Textarea | No |
| `personality` | Personality | Textarea | No |
| `speech_style` | Personality | Textarea | No |
| `likes_and_dislikes` | Personality | Textarea | No |
| `scenario` | Scenario | Textarea | No |
| `first_message` | Scenario | Textarea | No |

Fields NOT in the form (available via import or future advanced mode):
`alternate_greetings`, `mes_example`, `system_prompt`, `post_history_instructions`, `creator`, `creator_notes`, `character_version`, `world_info`, `extensions`, `cover_image`, `creator_name`, `prologue_preview`, `starting_scenarios`, `default_persona`, `length_guidance`, `relationship_state`, `stats`

## Constraints

- **Do not** implement backend changes — all CRUD endpoints already exist
- **Do not** break existing CardInfoModal or chat functionality
- **Do not** add authentication or multi-user support
- **Do not** implement advanced fields (world_info, starting_scenarios, default_persona) in the form — those come later
- **Do** reuse existing CSS variables and design tokens from the project's design system
- **Do** follow Svelte 5 runes patterns ($state, $derived, $effect, $props)
- **Do** handle loading and error states in the UI
