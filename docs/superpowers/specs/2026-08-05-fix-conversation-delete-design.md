# Fix conversation delete — design

Date: 2026-08-05

## Problem

Deleting a conversation from the Chats list appears to work but the conversation
returns on page refresh. The backend row is never deleted.

**Root cause:** the frontend API helper sends `Content-Type: application/json`
on every request, including bodyless `DELETE` requests. Fastify rejects a JSON
content-type with an empty body (`FST_ERR_CTP_EMPTY_JSON_BODY`, HTTP 400). The
`catch { /* best-effort */ }` in `deleteSession` swallows that 400, the
conversation is removed from the in-memory list (looks like success), but the
database row survives — so `loadSessions()` on refresh brings it back.

Verified live:
- `curl -X DELETE` (no Content-Type) → `204`, session count drops 35 → 34.
- Browser-style `DELETE` with `Content-Type: application/json` and no body →
  `400 FST_ERR_CTP_EMPTY_JSON_BODY`, row untouched.

## Non-goals

- **No schema changes.** The existing model already matches the intended design:
  a `session` table (conversations in the chat list, unique UUID PK generated on
  creation) and a `message` table whose rows belong to a session via
  `session_id REFERENCES session(id) ON DELETE CASCADE`. Deleting a session
  deletes its key and all referenced messages (cascade enforced by
  `PRAGMA foreign_keys = ON` in `backend/src/db.ts`).
- No table renames or reorganization.

## Changes

All changes are frontend; the backend and schema are untouched.

### 1. `frontend/src/lib/api/chat.ts` — only claim a JSON body when there is one

```typescript
async function request<T>(path: string, init: RequestInit): Promise<T> {
	const headers: Record<string, string> = {};
	// Fastify rejects Content-Type: application/json with an empty body
	// (FST_ERR_CTP_EMPTY_JSON_BODY) — only send it when there's a body.
	if (init.body != null) headers['Content-Type'] = 'application/json';
	const res = await fetch(`${BASE}${path}`, { headers, ...init });
	if (!res.ok) throw await errorFrom(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
```

Fixes both bodyless DELETEs: `deleteSessionApi` (session) and
`deleteSessionMessages` (reset). GETs were already fine; POSTs/PATCHes with
bodies are unchanged.

### 2. `frontend/src/lib/state/chat.svelte.ts` — `deleteSession`: fail = keep + show error

```typescript
try {
	await deleteSessionApi(sessionId);
} catch (err) {
	chat.error = err instanceof Error ? err.message : 'Failed to delete conversation';
	return; // keep the conversation — the list must reflect the database
}
// …only now: remove from sessions, messages, selection, active session
```

### 3. `chat.svelte.ts` — `resetSession`: same principle

If `deleteSessionMessages` throws: set `chat.error` and return; the existing
messages stay. No more "proceed with frontend reset" on a failed backend call.

### 4. `bulkDeleteSessions` / `bulkResetSessions` — no change

They already run every item through `deleteSession`/`resetSession`, which now
handle their own failures internally. Failed items stay in the list and
`chat.error` explains why. Note: failed items are left unselected after
`exitSelectionMode()` clears the selection — acceptable.

## Error surface

`chat.error` already renders as an alert banner in `MessageList.svelte` (and the
empty state in `CharacterGrid.svelte`). The same surface shows send failures
today, so no new UI is needed.

## Testing

Manual:
1. Start backend + frontend dev servers.
2. Create a conversation (New Play), send a message, reload — conversation persists.
3. Delete the conversation from the Chats list → it disappears immediately.
4. Reload → still gone. Verify with `curl http://127.0.0.1:3000/api/sessions`
   that the row is absent and its messages are gone (cascade).
5. Stop the backend, attempt delete → conversation stays in the list and an
   error banner appears.
6. Reset a conversation → messages clear; reload → still cleared (first message
   re-seeded per existing behavior).
