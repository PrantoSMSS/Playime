# Session Lifecycle Improvements Design

## Problem

Three issues with session lifecycle:

1. **New Play doesn't auto-navigate**: Clicking "New Play" in the character modal creates a session but leaves the user on the Character grid. They must manually navigate to Chats and find the conversation.

2. **Avatar missing in Chats list**: New conversations show only initials, not the character's avatar image. `startNewPlay()` uses `card.avatar` which can be null.

3. **Reset deletes messages instead of restarting**: "Reset chat" clears all messages but doesn't re-trigger the character's first message. The conversation becomes empty.

## Goal

Fix all three issues so that:
- New Play immediately opens the conversation view
- Sessions show the character's avatar in the Chats list
- Reset restarts the conversation from scratch using the same persona/scenario

---

## Issue 1: New Play → auto-navigate

**File:** `frontend/src/lib/state/chat.svelte.ts`

In `startNewPlay()`, after setting `chat.activeSessionId`, add:

```ts
nav.activeView = 'conversation';
```

This requires adding `import { nav } from '$lib/state/nav.svelte'` at the top of the file.

**Current code (line 216-217):**
```ts
chat.activeSessionId = apiSession.id;
chat.cardInfoModal = null;
```

**New code:**
```ts
chat.activeSessionId = apiSession.id;
nav.activeView = 'conversation';
chat.cardInfoModal = null;
```

---

## Issue 2: Avatar resolution

**File:** `frontend/src/lib/state/chat.svelte.ts`

In `startNewPlay()`, replace the avatar line with a simple fallback chain:

**Current code (line 184):**
```ts
const avatarUrl = modal.card.avatar ?? undefined;
```

**New code:**
```ts
const avatarUrl = modal.card.avatar ?? modal.card.cover_image ?? undefined;
```

This uses the card's default avatar, falls back to cover image, then to undefined (which renders initials in the Avatar component).

---

## Issue 3: Reset = re-invoke New Play

### 3a. Extend ChatSession type

**File:** `frontend/src/lib/types/chat.ts`

Add fields to store the New Play selections:

```ts
export interface ChatSession {
  // ... existing fields ...
  cardId?: string;
  personaId?: string;          // NEW
  personaSource?: 'default' | 'custom';  // NEW
  playerName?: string;         // NEW
  startingScenarioId?: string; // NEW
}
```

### 3b. Save selections in startNewPlay

**File:** `frontend/src/lib/state/chat.svelte.ts`

In `startNewPlay()`, save the selections on the session object:

```ts
const newSession: ChatSession = {
  // ... existing fields ...
  cardId: modal.card.id,
  personaId: selections.personaId,          // NEW
  personaSource: selections.personaSource,  // NEW
  playerName: selections.playerName,        // NEW
  startingScenarioId: selections.startingScenarioId,  // NEW
};
```

### 3c. Rewrite resetSession

**File:** `frontend/src/lib/state/chat.svelte.ts`

Replace `resetSession()` to re-invoke the first message:

```ts
export function resetSession(sessionId: string): void {
  const session = chat.sessions.find((s) => s.id === sessionId);
  if (!session || !session.cardId) return;

  // Clear all messages
  chat.messagesBySession[sessionId] = [];

  // Find the card to get the first message
  const card = chat.cards.find((c) => c.id === session.cardId);
  if (!card) return;

  // Resolve first message: from scenario, then from card default
  const scenario = session.startingScenarioId
    ? card.starting_scenarios.find((s) => s.id === session.startingScenarioId)
    : undefined;
  const firstMessage = scenario?.first_message ?? card.first_message;

  if (firstMessage) {
    chat.messagesBySession[sessionId].push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: firstMessage,
      createdAt: Date.now(),
    });
    session.preview = firstMessage;
  }

  // Navigate to the conversation
  nav.activeView = 'conversation';
  chat.activeSessionId = sessionId;
}
```

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/types/chat.ts` | Add `personaId`, `personaSource`, `playerName`, `startingScenarioId` to ChatSession |
| `frontend/src/lib/state/chat.svelte.ts` | Import `nav`; update `startNewPlay()` avatar + nav + session fields; rewrite `resetSession()` |

## Constraints

- CSS class names not renamed
- Backend API field names not renamed
- `activeSessionId` stays in chat state (navigation concern handled by `nav.activeView`)

## Verification

1. `npx svelte-check` — 0 errors
2. Click "New Play" in character modal → conversation view opens immediately
3. New session in Chats list shows character avatar (not just initials)
4. Click "Reset chat" → messages cleared, first message re-appears, same persona/scenario
5. Reset navigates to conversation view if not already there
