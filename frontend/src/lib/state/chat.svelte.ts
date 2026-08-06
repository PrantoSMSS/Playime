/**
 * Shared chat-shell state (Svelte 5 runes, module-level).
 *
 * Items 4/5: the Chats list and message threads start from
 * `$lib/data/sample.ts` (styling demos — there's no "New Play" flow until
 * Phase 2, so samples are the only way to open a chat). The first real send
 * in a session lazily creates a matching backend session
 * (`$lib/api/chat.ts`) and remembers the id mapping; every subsequent send
 * goes through the backend → adapter → SQLite loop and the reply renders in
 * the thread. Components only read/mutate this module, so the wiring stays
 * contained.
 */
import {
	createSession, getCard, listCards, listPersonas, streamMessage,
	createCard, updateCard, deleteCard,
	listSessions, listSessionMessages,
	deleteSessionApi, deleteSessionMessages,
	resolveFileUrl,
} from '../api/chat';
import type {
	ApiCharacterCard, ApiMessage, ApiPersona, ApiSession,
	CreateCardInput, UpdateCardInput,
} from '../api/chat';
import { SAMPLE_SESSIONS } from '../data/sample';
import type { ChatMessage, ChatSession } from '../types/chat';
import { nav } from './nav.svelte';

export type ResponseLength = 'Short' | 'Normal' | 'Long';

export const chat = $state({
	/** Currently-open session. */
	activeSessionId: '' as string,
	/** Past sessions for the Chats list (loaded from the backend on mount). */
	sessions: [] as ChatSession[],
	/** Per-session message threads. */
	messagesBySession: {} as Record<string, ChatMessage[]>,
	/** Right-top dropdown: response length / quality. */
	responseLength: 'Normal' as ResponseLength,
	/** True while a send is awaiting the backend reply. */
	sending: false,
	/** Last send failure message (cleared on the next send). */
	error: null as string | null,
	/** Card info modal state. */
	cardInfoModal: null as { card: ApiCharacterCard } | null,
	/** Available personas for the New Play persona picker. */
	personas: [] as ApiPersona[],
	/** All loaded character cards. */
	cards: [] as ApiCharacterCard[],
	/** Character form modal state (create or edit). */
	characterFormModal: null as {
		mode: 'create' | 'edit';
		card?: ApiCharacterCard;
		importedData?: Partial<CreateCardInput>;
	} | null,
	/** Import card modal state. */
	importCardModal: null as {
		onparsed: (data: Partial<CreateCardInput>) => void;
	} | null,
	/** Bulk selection mode for the Chats list. */
	selectionMode: false,
	/** IDs of currently selected sessions (bulk operations). Object for Svelte 5 reactivity. */
	selectedSessionIds: {} as Record<string, boolean>,
});

/** Display session id → backend session id, for sessions made real on demand. */
const backendSessions: Record<string, string> = {};

export function activeSession(): ChatSession | undefined {
	return chat.sessions.find((s) => s.id === chat.activeSessionId);
}

export function activeMessages(): ChatMessage[] {
	return chat.messagesBySession[chat.activeSessionId] ?? [];
}

/** Open the card info modal for a given card. */
export async function openCardInfoModal(cardId: string): Promise<void> {
	try {
		const [card, personas] = await Promise.all([getCard(cardId), listPersonas()]);
		chat.cardInfoModal = { card };
		chat.personas = personas;
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to load card';
	}
}

/** Close the card info modal. */
export function closeCardInfoModal(): void {
	chat.cardInfoModal = null;
}

/** Load all character cards from the backend. */
export async function loadCards(): Promise<void> {
	try {
		chat.cards = await listCards();
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to load cards';
	}
}

/** Convert a backend ApiSession to a frontend ChatSession. */
function sessionFromApi(s: ApiSession, cards: ApiCharacterCard[]): ChatSession {
	const card = s.character_card_id ? cards.find((c) => c.id === s.character_card_id) : undefined;
	const title = card?.name ?? s.character_card_id ?? 'Untitled';
	const rawAvatar = s.avatar_snapshot?.image ?? card?.avatars[0]?.image ?? card?.avatar ?? card?.avatar_file ?? card?.cover_file ?? card?.cover_image ?? undefined;
	const avatarUrl = resolveFileUrl(rawAvatar) ?? undefined;
	return {
		id: s.id,
		title,
		kind: s.class,
		preview: '',
		initials: title.slice(0, 2).toUpperCase(),
		hue: 172,
		cardId: s.character_card_id ?? undefined,
		personaId: s.persona_id ?? undefined,
		personaSource: (s.persona_source as 'default' | 'custom') ?? undefined,
		startingScenarioId: s.starting_scenario_id ?? undefined,
		avatarUrl,
		createdAt: s.created_at,
	};
}

/** Load all sessions from the backend, replacing any existing list. */
export async function loadSessions(): Promise<void> {
	try {
		const apiSessions = await listSessions();
		// Filter out cardless sessions (created as side-effects of legacy sends).
		const validSessions = apiSessions.filter((s) => s.character_card_id != null);
		chat.sessions = validSessions.map((s) => sessionFromApi(s, chat.cards));
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to load sessions';
	}
}

/** Load messages for a session from the backend into the message store. */
export async function loadSessionMessages(sessionId: string): Promise<void> {
	try {
		const apiMessages = await listSessionMessages(sessionId);
		chat.messagesBySession[sessionId] = apiMessages.map(messageFromApi);
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to load messages';
	}
}

/** Create or update a character card. Returns the saved card. */
export async function saveCard(
	mode: 'create' | 'edit',
	input: CreateCardInput | UpdateCardInput,
	existingId?: string,
): Promise<ApiCharacterCard | null> {
	try {
		let card: ApiCharacterCard;
		if (mode === 'edit' && existingId) {
			card = await updateCard(existingId, input as UpdateCardInput);
		} else {
			card = await createCard(input as CreateCardInput);
		}
		// Refresh the list
		chat.cards = await listCards();
		return card;
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to save card';
		return null;
	}
}

/** Delete a character card. */
export async function removeCard(id: string): Promise<boolean> {
	try {
		await deleteCard(id);
		chat.cards = chat.cards.filter((c) => c.id !== id);
		return true;
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to delete card';
		return false;
	}
}

/** Open the character form modal for creating a new card. */
export function openCreateCardModal(importedData?: Partial<CreateCardInput>): void {
	chat.characterFormModal = { mode: 'create', importedData };
}

/** Open the character form modal for editing an existing card. */
export function openEditCardModal(card: ApiCharacterCard): void {
	chat.cardInfoModal = null; // Close info modal if open
	chat.characterFormModal = { mode: 'edit', card };
}

/** Close the character form modal. */
export function closeCharacterFormModal(): void {
	chat.characterFormModal = null;
}

/** Open the import card modal with a callback for parsed data. */
export function openImportCardModal(onparsed: (data: Partial<CreateCardInput>) => void): void {
	chat.importCardModal = { onparsed };
}

/** Close the import card modal. */
export function closeImportCardModal(): void {
	chat.importCardModal = null;
}

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

/** Reset a session: clear messages and re-trigger the character's first message. */
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

// ── Bulk selection ──────────────────────────────────────────────────────

/** Toggle a session's selection state. */
export function toggleSelection(sessionId: string): void {
	if (chat.selectedSessionIds[sessionId]) {
		delete chat.selectedSessionIds[sessionId];
	} else {
		chat.selectedSessionIds[sessionId] = true;
	}
}

/** Select or deselect all visible sessions. */
export function selectAll(visibleIds: string[]): void {
	const allSelected = visibleIds.every((id) => chat.selectedSessionIds[id]);
	if (allSelected) {
		for (const id of visibleIds) delete chat.selectedSessionIds[id];
	} else {
		for (const id of visibleIds) chat.selectedSessionIds[id] = true;
	}
}

/** Clear all selections. */
export function clearSelection(): void {
	chat.selectedSessionIds = {};
}

/** Enter selection mode. */
export function enterSelectionMode(): void {
	chat.selectionMode = true;
	chat.selectedSessionIds = {};
}

/** Exit selection mode and clear selections. */
export function exitSelectionMode(): void {
	chat.selectionMode = false;
	chat.selectedSessionIds = {};
}

/** Delete all selected sessions (bulk). */
export async function bulkDeleteSessions(): Promise<void> {
	const ids = Object.keys(chat.selectedSessionIds);
	exitSelectionMode();
	await Promise.all(ids.map((id) => deleteSession(id)));
}

/** Reset all selected sessions (bulk). */
export async function bulkResetSessions(): Promise<void> {
	const ids = Object.keys(chat.selectedSessionIds);
	exitSelectionMode();
	await Promise.all(ids.map((id) => resetSession(id)));
}

/** Start a new play session from the card info modal selections. */
export async function startNewPlay(selections: {
	personaId?: string;
	personaSource?: 'default' | 'custom';
	playerName?: string;
	startingScenarioId?: string;
}): Promise<void> {
	const modal = chat.cardInfoModal;
	if (!modal) return;

	try {
		const apiSession = await createSession({
			cardId: modal.card.id,
			personaId: selections.personaId,
			personaSource: selections.personaSource,
			playerName: selections.playerName,
			startingScenarioId: selections.startingScenarioId,
		});

		// Register the backend session so sendMessage() can find it
		// without creating a duplicate cardless session.
		backendSessions[apiSession.id] = apiSession.id;

		// The session's avatarUrl is the CHARACTER's image (from CharacterCard.avatar),
		// not the user's persona avatar.
		const rawAvatar = modal.card.avatars[0]?.image ?? modal.card.avatar ?? modal.card.avatar_file ?? modal.card.cover_file ?? modal.card.cover_image ?? undefined;
		const avatarUrl = resolveFileUrl(rawAvatar) ?? undefined;

		const newSession: ChatSession = {
			id: apiSession.id,
			title: modal.card.name,
			kind: 'character',
			preview: modal.card.first_message ?? 'New conversation started',
			initials: modal.card.name.slice(0, 2).toUpperCase(),
			hue: 172,
			cardId: modal.card.id,
			personaId: selections.personaId,
			personaSource: selections.personaSource,
			playerName: selections.playerName,
			startingScenarioId: selections.startingScenarioId,
			avatarUrl,
			createdAt: Date.now(),
		};

		chat.sessions.unshift(newSession);
		chat.messagesBySession[apiSession.id] = [];

		// If the card has a first message, add it as the opening assistant message
		const scenario = modal.card.starting_scenarios.find(
			(s) => s.id === selections.startingScenarioId
		);
		const firstMessage = scenario?.first_message ?? modal.card.first_message;
		if (firstMessage) {
			chat.messagesBySession[apiSession.id].push({
				id: crypto.randomUUID(),
				role: 'assistant',
				content: firstMessage,
				createdAt: Date.now(),
			});
			newSession.preview = firstMessage;
		}

		chat.activeSessionId = apiSession.id;
		nav.activeView = 'conversation';
		chat.cardInfoModal = null;
	} catch (err) {
		chat.error = err instanceof Error ? err.message : 'Failed to start new play';
	}
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
	// For sessions created via New Play, the backend session is already created
	// with the card_id and selections. For legacy sample sessions, create a
	// basic session without a card.
	const session = chat.sessions.find((s) => s.id === frontendId);
	const isLegacySession = !session || SAMPLE_SESSIONS.some((s) => s.id === session.id);
	const apiSession = await createSession(
		isLegacySession ? undefined : { cardId: session?.cardId },
	);
	backendSessions[frontendId] = apiSession.id;
	return apiSession.id;
}

/**
 * Send a user turn to the backend and render the reply as it streams in. The
 * user's message is appended optimistically (appears instantly), followed by a
 * live `streaming` placeholder that fills token-by-token. On the `done` frame
 * both are swapped for the persisted rows (ids then match the DB). Re-entrant
 * sends while one is in flight are dropped.
 */
export async function sendMessage(content: string): Promise<void> {
	if (chat.sending) return;
	const session = activeSession();
	if (!session) return;

	const list = (chat.messagesBySession[session.id] ??= []);
	const optimisticId = crypto.randomUUID();
	const streamId = crypto.randomUUID();
	list.push({ id: optimisticId, role: 'user', content, createdAt: Date.now() });
	list.push({
		id: streamId,
		role: 'assistant',
		content: '',
		createdAt: Date.now(),
		streaming: true,
	});

	chat.sending = true;
	chat.error = null;

	const dropStreaming = (): void => {
		const idx = list.findIndex((m) => m.id === streamId);
		if (idx >= 0) list.splice(idx, 1);
	};

	try {
		const backendId = await ensureBackendSession(session.id);
		await streamMessage(backendId, content, {
			onDelta: (text) => {
				const m = list.find((x) => x.id === streamId);
				if (m) m.content += text;
			},
			onDone: (res) => {
				const optimisticIdx = list.findIndex((m) => m.id === optimisticId);
				if (optimisticIdx >= 0) list[optimisticIdx] = messageFromApi(res.user_message);
				const streamIdx = list.findIndex((m) => m.id === streamId);
				if (streamIdx >= 0) list[streamIdx] = messageFromApi(res.message);
				const s = chat.sessions.find((x) => x.id === session.id);
				if (s) s.preview = res.message.content;
			},
			onError: (_code, message) => {
				chat.error = message;
				dropStreaming();
				// Also remove the optimistic user message so the user can retry cleanly
				const optIdx = list.findIndex((m) => m.id === optimisticId);
				if (optIdx >= 0) list.splice(optIdx, 1);
			},
		});
	} catch (err) {
		chat.error =
			err instanceof Error ? err.message : 'Could not reach the server. Is it running?';
		dropStreaming();
	} finally {
		chat.sending = false;
	}
}
