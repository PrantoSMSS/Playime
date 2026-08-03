/**
 * Shared chat-shell state (Svelte 5 runes, module-level).
 *
 * Items 4/5: the History list and message threads start from
 * `$lib/data/sample.ts` (styling demos — there's no "New Play" flow until
 * Phase 2, so samples are the only way to open a chat). The first real send
 * in a session lazily creates a matching backend session
 * (`$lib/api/chat.ts`) and remembers the id mapping; every subsequent send
 * goes through the backend → adapter → SQLite loop and the reply renders in
 * the thread. Components only read/mutate this module, so the wiring stays
 * contained.
 */
import { createSession, postMessage } from '../api/chat';
import type { ApiMessage } from '../api/chat';
import { SAMPLE_MESSAGES_BY_SESSION, SAMPLE_SESSIONS } from '../data/sample';
import type { ChatMessage, ChatSession } from '../types/chat';

export type NavId = 'search' | 'story' | 'character' | 'my-titles' | 'notifications';

export type ResponseLength = 'Short' | 'Normal' | 'Long';

export const chat = $state({
	/** Active nav-rail item. */
	nav: 'character' as NavId,
	/** Active History tab. */
	historyTab: 'character' as 'story' | 'character',
	/** Currently-open session. */
	activeSessionId: SAMPLE_SESSIONS[0]?.id ?? '',
	/** Past sessions for the History list. */
	sessions: [...SAMPLE_SESSIONS],
	/** Per-session message threads. */
	messagesBySession: structuredClone(SAMPLE_MESSAGES_BY_SESSION) as Record<string, ChatMessage[]>,
	/** Right-top dropdown: response length / quality. */
	responseLength: 'Normal' as ResponseLength,
	/** True while a send is awaiting the backend reply. */
	sending: false,
	/** Last send failure message (cleared on the next send). */
	error: null as string | null,
});

/** Display session id → backend session id, for sessions made real on demand. */
const backendSessions: Record<string, string> = {};

export function activeSession(): ChatSession | undefined {
	return chat.sessions.find((s) => s.id === chat.activeSessionId);
}

export function activeMessages(): ChatMessage[] {
	return chat.messagesBySession[chat.activeSessionId] ?? [];
}

/** Backend message row → chat-shell message. */
function messageFromApi(msg: ApiMessage): ChatMessage {
	// The message endpoint only returns user/assistant turns; a system row
	// would only appear via a bug, so fall back to rendering it as a reply.
	return {
		id: msg.id,
		role: msg.role === 'user' ? 'user' : 'assistant',
		content: msg.content,
		createdAt: msg.created_at,
	};
}

/** Get (or lazily create) the backend session backing a display session. */
async function ensureBackendSession(frontendId: string): Promise<string> {
	const existing = backendSessions[frontendId];
	if (existing) return existing;
	const apiSession = await createSession();
	backendSessions[frontendId] = apiSession.id;
	return apiSession.id;
}

/**
 * Send a user turn to the backend and render the reply. The user's message is
 * appended optimistically so it appears during the multi-second adapter call;
 * on success the stored rows replace it (ids then match the DB). Re-entrant
 * sends while one is in flight are dropped.
 */
export async function sendMessage(content: string): Promise<void> {
	if (chat.sending) return;
	const session = activeSession();
	if (!session) return;

	const list = (chat.messagesBySession[session.id] ??= []);
	const optimisticId = crypto.randomUUID();
	list.push({ id: optimisticId, role: 'user', content, createdAt: Date.now() });

	chat.sending = true;
	chat.error = null;
	try {
		const backendId = await ensureBackendSession(session.id);
		const res = await postMessage(backendId, content);

		// Swap the optimistic turn for the persisted row, then append the reply.
		const optimisticIdx = list.findIndex((m) => m.id === optimisticId);
		if (optimisticIdx >= 0) list[optimisticIdx] = messageFromApi(res.user_message);
		list.push(messageFromApi(res.message));

		const s = chat.sessions.find((x) => x.id === session.id);
		if (s) s.preview = res.message.content;
	} catch (err) {
		chat.error =
			err instanceof Error ? err.message : 'Could not reach the server. Is it running?';
	} finally {
		chat.sending = false;
	}
}
