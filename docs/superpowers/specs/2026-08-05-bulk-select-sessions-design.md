# Bulk Select Sessions Design

## Summary

Add selection mode to the Chats list so users can select multiple conversations and delete or reset them in bulk.

## Interaction Flow

### Normal Mode (existing)
- Header: "Chats" title + Story/Character tabs
- Per-session `...` dropdown: single Delete/Reset

### Selection Mode
- **Enter**: Click "Select" button in header
- **Header changes**: "Chats" → "Select conversations" + "Select All" link + "Done" button
- **Session items**: Checkbox appears on left side of each row; `...` menu hidden
- **Bottom action bar**: Fixed bar with "Delete (N)" and "Reset (N)" buttons, where N = selected count
- **Exit**: Click "Done" or press Escape; clears selection

### Selecting
- Click row or checkbox to toggle selection
- "Select All" toggles all visible (filtered by Story/Character tab) sessions
- Selected rows get a subtle highlight (use existing `--accent-soft`)

### Actions
- **Delete**: Calls `DELETE /api/sessions/:id` for each, removes from frontend state
- **Reset**: Calls `DELETE /api/sessions/:id/messages` for each, clears frontend messages, re-persists first message if card exists

## Backend Changes

### `DELETE /api/sessions/:id`
- Delete session row (messages cascade via FK)
- Return 204

### `DELETE /api/sessions/:id/messages`
- Delete all message rows for session
- Return 204

### Model additions in `session.ts`
- `deleteSession(id)` — DELETE FROM session WHERE id = ?
- `deleteMessages(sessionId)` — DELETE FROM message WHERE session_id = ?

## Frontend State Changes

### `chat.svelte.ts`
- `chat.selectionMode: boolean` — whether selection mode is active
- `chat.selectedSessionIds: Set<string>` — selected session IDs
- `bulkDeleteSessions(ids: string[])` — delete each via API, remove from state
- `bulkResetSessions(ids: string[])` — reset each via API, clear messages, re-persist first message
- `toggleSelection(id)` / `selectAll visible` / `clearSelection()` / `exitSelectionMode()`

### API additions in `chat.ts`
- `deleteSessionApi(id)` — `DELETE /api/sessions/:id`
- `deleteSessionMessages(id)` — `DELETE /api/sessions/:id/messages`

## Component Changes

### `ChatsList.svelte`
- Import `selectionMode`, `selectedSessionIds`, `toggleSelection`, `selectAll`, `clearSelection`, `exitSelectionMode`, `bulkDeleteSessions`, `bulkResetSessions` from state
- Header: conditionally render "Select" button (normal mode) or "Select All" + "Done" (selection mode)
- Session rows: show checkbox when in selection mode; clicking row toggles selection instead of opening conversation
- Bottom action bar: render when selection mode + at least 1 selected

## Files to modify
- `backend/src/models/session.ts` — add `deleteSession`, `deleteMessages`
- `backend/src/routes/chat.ts` — add DELETE routes
- `frontend/src/lib/api/chat.ts` — add `deleteSessionApi`, `deleteSessionMessages`
- `frontend/src/lib/state/chat.svelte.ts` — add selection state + bulk operations
- `frontend/src/lib/components/chat/ChatsList.svelte` — selection UI
