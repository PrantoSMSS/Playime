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
import {
	createSession, getCard, listCards, listPersonas, streamMessage,
	createCard, updateCard, deleteCard,
} from '../api/chat';
import type {
	ApiCharacterCard, ApiMessage, ApiPersona,
	CreateCardInput, UpdateCardInput,
} from '../api/chat';
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
	} | null,
	/** Import card modal visibility. */
	importCardModal: false as boolean,
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
export function openCreateCardModal(): void {
	chat.characterFormModal = { mode: 'create' };
}

/** Open the character form modal for editing an existing card. */
export function openEditCardModal(card: ApiCharacterCard): void {
	chat.characterFormModal = { mode: 'edit', card };
}

/** Close the character form modal. */
export function closeCharacterFormModal(): void {
	chat.characterFormModal = null;
}

/** Open the import card modal. */
export function openImportCardModal(): void {
	chat.importCardModal = true;
}

/** Close the import card modal. */
export function closeImportCardModal(): void {
	chat.importCardModal = false;
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

		// The session's avatarUrl is the CHARACTER's image (from CharacterCard.avatar),
		// not the user's persona avatar.
		const avatarUrl = modal.card.avatar ?? undefined;

		const newSession: ChatSession = {
			id: apiSession.id,
			title: modal.card.name,
			kind: 'character',
			preview: modal.card.first_message ?? 'New conversation started',
			initials: modal.card.name.slice(0, 2).toUpperCase(),
			hue: 172,
			cardId: modal.card.id,
			avatarUrl,
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
	const apiSession = await createSession(isLegacySession ? undefined : { cardId: undefined });
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
