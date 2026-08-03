/**
 * Shared chat-shell state (Svelte 5 runes, module-level).
 *
 * Items 4/5: today this is seeded from `$lib/data/sample.ts`; wiring the real
 * backend means swapping `sessions`/`messagesBySession` population (or
 * `addMessage`) for `fetch` calls. Components only read/mutate this module,
 * so that swap stays contained.
 */
import { SAMPLE_MESSAGES_BY_SESSION, SAMPLE_SESSIONS } from '../data/sample';
import type { ChatMessage, ChatSession } from '../types/chat';

export type NavId =
	| 'search'
	| 'story'
	| 'character'
	| 'my-titles'
	| 'notifications'
	| 'credits';

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
});

export function activeSession(): ChatSession | undefined {
	return chat.sessions.find((s) => s.id === chat.activeSessionId);
}

export function activeMessages(): ChatMessage[] {
	return chat.messagesBySession[chat.activeSessionId] ?? [];
}

/** Append a turn to the active session's thread. */
export function addMessage(content: string, role: 'user' | 'assistant'): void {
	const session = activeSession();
	if (!session) return;
	const list = (chat.messagesBySession[session.id] ??= []);
	list.push({ id: crypto.randomUUID(), role, content, createdAt: Date.now() });
}
