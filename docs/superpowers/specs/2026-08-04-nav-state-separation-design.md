# Nav State Separation Design

## Problem

Navigation state (`nav`, `chatsTab`) currently lives inside `chat.svelte.ts`, the chat data module. This causes routing bugs — clicking a session in Chats doesn't properly switch views, and nav state is coupled to conversation data. Routing logic mixes `activeSessionId` with nav state, creating fragile conditional branches.

## Goal

Separate navigation/routing state into its own module. Each nav rail item renders its own page independently. Chat state only holds conversation data.

## Architecture

### New module: `frontend/src/lib/state/nav.svelte.ts`

Module-level `$state` runes (same pattern as `chat.svelte.ts`):

```ts
export type NavView =
  | 'search' | 'story' | 'character' | 'chats'
  | 'my-titles' | 'notifications'
  | 'conversation';

export const nav = $state({
  activeView: 'character' as NavView,
});

export type ChatsTab = 'story' | 'character';
export const chatsTab = $state({
  tab: 'character' as ChatsTab,
});
```

`'conversation'` is an **implicit view** — not shown in the nav rail, never set by a nav button. Only `ChatsList` sets it when a session is clicked.

### Slimmed `chat.svelte.ts`

Remove from chat state:
- `NavId` type export
- `nav: 'character'` field
- `chatsTab: 'character'` field

Keep all other fields: `activeSessionId`, `sessions`, `messagesBySession`, `responseLength`, `sending`, `error`, `cardInfoModal`, `personas`, `cards`, `characterFormModal`, `importCardModal`.

### Routing (`+page.svelte`)

Purely driven by `nav.activeView`:

```svelte
{#if nav.activeView === 'conversation'}
  <div class="chat">
    <ChatTopBar />
    <MessageList />
    <div class="chat__composer">
      <ChatInput onSend={handleSend} disabled={chat.sending} />
    </div>
  </div>
{:else if nav.activeView === 'character'}
  <CharacterGrid />
{:else if nav.activeView === 'chats'}
  <ChatsList />
{:else}
  <div class="placeholder"><p>Coming soon</p></div>
{/if}
```

Views that render "Coming soon": `search`, `story`, `my-titles`, `notifications`.

### Nav rail (`NavRail.svelte`)

- Imports `nav`, `NavView` from `$lib/state/nav.svelte`
- Does **not** include `'conversation'` in `NAV_ITEMS`
- Click handler: `nav.activeView = item.id`
- Active check: `nav.activeView === item.id`

### Chats list (`ChatsList.svelte`)

- Imports `nav`, `chatsTab` from `$lib/state/nav.svelte`
- Imports `chat` from `$lib/state/chat.svelte`
- Tab clicks: `chatsTab.tab = 'story'` / `'character'`
- Session click handler:
  ```ts
  function handleSessionClick(s: ChatSession): void {
    chat.activeSessionId = s.id;
    nav.activeView = 'conversation';
  }
  ```

### Chat top bar (`ChatTopBar.svelte`)

- Imports `nav` from `$lib/state/nav.svelte`
- Back button: `nav.activeView = 'chats'` (was `history.back()`)

## Data flow

```
User clicks session in ChatsList
  → chat.activeSessionId = s.id
  → nav.activeView = 'conversation'
  → +page.svelte re-renders ChatView
  → ChatView reads chat.activeSessionId to display the right conversation

User clicks Back in ChatTopBar
  → nav.activeView = 'chats'
  → +page.svelte re-renders ChatsList
  → ChatsList still has chat.activeSessionId set (session highlighted)

User clicks "Character" in nav rail
  → nav.activeView = 'character'
  → +page.svelte re-renders CharacterGrid
  → ChatsList is unmounted, chat.activeSessionId unchanged (data preserved)
```

## Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/state/nav.svelte.ts` | **New** — `nav`, `chatsTab` state |
| `frontend/src/lib/state/chat.svelte.ts` | Remove `NavId`, `nav`, `chatsTab` |
| `frontend/src/lib/components/chat/NavRail.svelte` | Import from nav.svelte |
| `frontend/src/lib/components/chat/ChatsList.svelte` | Import from nav.svelte, session click sets `nav.activeView = 'conversation'` |
| `frontend/src/routes/+page.svelte` | Route on `nav.activeView` |
| `frontend/src/lib/components/chat/ChatTopBar.svelte` | Back button → `nav.activeView = 'chats'` |

## Constraints

- `activeSessionId` stays in `chat.svelte.ts` — it's conversation data, not navigation
- Internal CSS class names (`history-list__*`) are not renamed
- Backend API field names (`post_history_instructions`) are not renamed
- `ChatsTab` type is `'story' | 'character'` — same as current
