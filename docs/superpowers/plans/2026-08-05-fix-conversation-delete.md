# Fix conversation delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the conversation delete bug so deleting a conversation removes it from the database, and failures surface as errors instead of being silently swallowed.

**Architecture:** Fix the frontend API client to not send `Content-Type: application/json` on bodyless requests (the root cause). Then fix `deleteSession` and `resetSession` to fail loudly — if the backend call fails, the conversation stays in the list and `chat.error` shows the reason. No backend or schema changes.

**Tech Stack:** Svelte 5 (runes mode), TypeScript, SQLite via `node:sqlite`, Fastify backend.

## Global Constraints

- No schema changes — the existing `session`/`message` tables already implement the required model.
- No backend changes — the bug is entirely in the frontend API client.
- `chat.error` is the existing error surface — it renders as an alert banner in `MessageList.svelte`.
- Follow existing patterns — use the same try/catch + `chat.error` pattern already used by other state functions.

---

## Task 1: Fix `request()` to not send Content-Type on bodyless requests

**Files:**
- Modify: `frontend/src/lib/api/chat.ts:158-166`

**Interfaces:**
- Consumes: none (standalone fix)
- Produces: `request<T>()` now sends `Content-Type: application/json` only when `init.body != null`; DELETE/PATCH/POST without body get no header; status 204 returns `undefined as T`.

- [ ] **Step 1: Read the current `request()` function**

Read `frontend/src/lib/api/chat.ts` lines 158-166:

```typescript
async function request<T>(path: string, init: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
	if (!res.ok) throw await errorFrom(res);
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
```

- [ ] **Step 2: Replace the `request()` function**

Replace the function body with:

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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3`
Expected: `COMPLETED 184 FILES 0 ERRORS`

- [ ] **Step 4: Manual smoke test — DELETE session**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser, create a conversation (New Play), send a message.
4. Delete the conversation from the Chats list.
5. Refresh the page — the conversation should still be gone.
6. Verify with `curl http://127.0.0.1:3000/api/sessions` that the row is absent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/chat.ts
git commit -m "fix(api): don't send Content-Type on bodyless DELETE requests"
```

---

## Task 2: Fix `deleteSession` to fail loudly

**Files:**
- Modify: `frontend/src/lib/state/chat.svelte.ts:202-213`

**Interfaces:**
- Consumes: `deleteSessionApi(sessionId)` (from `frontend/src/lib/api/chat.ts`), `chat.sessions`, `chat.messagesBySession`, `chat.selectedSessionIds`, `chat.activeSessionId`, `chat.error`
- Produces: Updated `deleteSession(sessionId)` — returns after showing error on backend failure, never removes from list unless backend confirms deletion.

- [ ] **Step 1: Read the current `deleteSession` function**

Read `frontend/src/lib/state/chat.svelte.ts` lines 202-213:

```typescript
export async function deleteSession(sessionId: string): Promise<void> {
	try {
		await deleteSessionApi(sessionId);
	} catch { /* best-effort — remove from UI even if backend fails */ }
	chat.sessions = chat.sessions.filter((s) => s.id !== sessionId);
	delete chat.messagesBySession[sessionId];
	delete chat.selectedSessionIds[sessionId];
	if (chat.activeSessionId === sessionId) {
		chat.activeSessionId = '';
	}
}
```

- [ ] **Step 2: Replace the function body**

Replace the entire function with:

```typescript
/** Delete a session and its messages (backend + frontend). */
export async function deleteSession(sessionId: string): Promise<void> {
	try {
		await deleteSessionApi(sessionId);
	} catch (err) {
		// Keep the conversation — the list must reflect the database.
		chat.error = err instanceof Error ? err.message : 'Failed to delete conversation';
		return;
	}
	chat.sessions = chat.sessions.filter((s) => s.id !== sessionId);
	delete chat.messagesBySession[sessionId];
	delete chat.selectedSessionIds[sessionId];
	if (chat.activeSessionId === sessionId) {
		chat.activeSessionId = '';
	}
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3`
Expected: `COMPLETED 184 FILES 0 ERRORS`

- [ ] **Step 4: Manual smoke test — delete failure shows error**

1. Start backend and frontend.
2. Create a conversation, send a message.
3. Stop the backend (Ctrl+C the backend process).
4. Try to delete the conversation from the Chats list.
5. Verify: the conversation stays in the list (not removed).
6. Verify: an error banner appears in the MessageList pane.
7. Restart the backend — the conversation is still in the DB.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/state/chat.svelte.ts
git commit -m "fix(state): deleteSession fails loudly instead of swallowing errors"
```

---

## Task 3: Fix `resetSession` to fail loudly

**Files:**
- Modify: `frontend/src/lib/state/chat.svelte.ts:215-250`

**Interfaces:**
- Consumes: `deleteSessionMessages(sessionId)` (from `frontend/src/lib/api/chat.ts`), `chat.sessions`, `chat.cards`, `chat.messagesBySession`, `chat.error`, `nav.activeView`
- Produces: Updated `resetSession(sessionId)` — returns after showing error on backend failure, never clears messages unless backend confirms deletion.

- [ ] **Step 1: Read the current `resetSession` function**

Read `frontend/src/lib/state/chat.svelte.ts` lines 215-250. The key part is:

```typescript
// Clear messages on backend
try {
	await deleteSessionMessages(sessionId);
} catch { /* proceed with frontend reset */ }

// Clear all messages
chat.messagesBySession[sessionId] = [];
```

- [ ] **Step 2: Replace the error-handling section**

Replace lines 215-223 (the function start through the catch block):

```typescript
export async function resetSession(sessionId: string): Promise<void> {
	const session = chat.sessions.find((s) => s.id === sessionId);
	if (!session || !session.cardId) return;

	// Clear messages on backend — fail = keep existing messages
	try {
		await deleteSessionMessages(sessionId);
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to reset conversation';
		return;
	}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3`
Expected: `COMPLETED 184 FILES 0 ERRORS`

- [ ] **Step 4: Manual smoke test — reset failure shows error**

1. Start backend and frontend.
2. Create a conversation, send a few messages.
3. Stop the backend.
4. Right-click the conversation → Reset chat.
5. Verify: the messages stay in the conversation (not cleared).
6. Verify: an error banner appears in the MessageList pane.
7. Restart the backend — the messages are still in the DB.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/state/chat.svelte.ts
git commit -m "fix(state): resetSession fails loudly instead of proceeding with stale frontend"
```

---

## Task 4: Final verification — full delete flow

**Files:**
- None (verification only)

- [ ] **Step 1: Start both dev servers**

```bash
cd backend && npm run dev   # in terminal 1
cd frontend && npm run dev  # in terminal 2
```

- [ ] **Step 2: Verify DELETE works end-to-end**

1. Create a conversation via New Play, send a message.
2. Note the session count: `curl -s http://127.0.0.1:3000/api/sessions | python -c "import sys,json; print(len(json.load(sys.stdin)))"`.
3. Delete the conversation from the Chats list.
4. Check count again — should be one less.
5. Refresh the page — conversation stays gone.

- [ ] **Step 3: Verify RESET works end-to-end**

1. Create another conversation, send a few messages.
2. Right-click → Reset chat.
3. Refresh — messages are cleared (first message re-seeded).

- [ ] **Step 4: Verify BULK DELETE works**

1. Select multiple conversations in bulk mode.
2. Click Delete.
3. Verify all selected conversations are gone after refresh.

- [ ] **Step 5: Verify error surfacing**

1. Stop the backend.
2. Try deleting a conversation → error banner, conversation stays.
3. Try resetting a conversation → error banner, messages stay.
4. Restart backend → everything is consistent.
