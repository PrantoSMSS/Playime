/**
 * Typed client for the Playime backend chat API (checklist item 5).
 *
 * The backend is a separate Fastify process (default http://127.0.0.1:3000)
 * reached over HTTP with CORS — see backend/src/index.ts. Response shapes
 * mirror the backend rows exactly (snake_case keys), so nothing is renamed
 * here; these types are the wire format.
 *
 * Non-streaming for now: postMessage resolves with the completed reply. SSE
 * lands in checklist item 6.
 */
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const BASE = (PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

/**
 * Resolve a relative file path to a full URL.
 * Handles both old URL format (http/https/data:) and new relative path format
 * (e.g. "character/{id}/avatar.png") returned by the local-first file storage.
 */
export function resolveFileUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
		return path; // Already a full URL
	}
	return `${BASE}/api/files/${path}`;
}

/** Avatar option from the backend. */
export interface ApiAvatarOption {
	id: string;
	name?: string;
	image: string;
}

/** Character/Story-level default persona with predefined narrative details. */
export interface ApiDefaultPersona {
	label?: string;
	name: string;
	role?: string;
	background?: string;
	personality?: string;
	appearance?: string;
	pronouns?: string;
	details?: string;
}

/** Starting scenario from the backend. */
export interface ApiStartingScenario {
	id: string;
	name: string;
	description?: string;
	scenario: string;
	first_message: string;
}

/** A character card from the backend. */
export interface ApiCharacterCard {
	id: string;
	name: string;
	avatar: string | null;
	tagline: string;
	personality: string;
	speech_style: string;
	likes_and_dislikes: string;
	scenario: string;
	first_message: string | null;
	relationship_state: { affection: number; trust: number; flags: string[] };
	length_guidance: string | null;
	avatars: ApiAvatarOption[];
	starting_scenarios: ApiStartingScenario[];
	default_persona: ApiDefaultPersona | null;
	alternate_greetings: string[];
	mes_example: string | null;
	system_prompt: string | null;
	post_history_instructions: string | null;
	creator: string | null;
	creator_notes: string | null;
	character_version: string | null;
	world_info: unknown[];
	extensions: Record<string, unknown>;
	avatar_file: string | null;
	cover_file: string | null;
	cover_image: string | null;
	creator_name: string | null;
	tags: string[];
	description: string | null;
	prologue_preview: string | null;
	stats: { replay_count: number; like_count: number; comment_count: number };
	created_at: number;
	updated_at: number;
}

/** A row from the backend `session` table. */
export interface ApiSession {
	id: string;
	class: 'character' | 'story';
	created_at: number;
	provider: string;
	model: string | null;
	small_model: string | null;
	character_card_id: string | null;
	avatar_selection: string | null;
	starting_scenario_id: string | null;
	avatar_snapshot: ApiAvatarOption | null;
	starting_scenario_snapshot: ApiStartingScenario | null;
	persona_id: string | null;
	persona_snapshot: ApiPersona | null;
	persona_source: string | null;
	favorite: number;
}

/** A persona (user identity) from the backend. */
export interface ApiPersona {
	id: string;
	name: string;
	avatar: string | null;
	avatar_file: string | null;
	description: string;
	appearance: string;
	personality: string;
	pronouns: string;
	created_at: number;
	updated_at: number;
}

/** A row from the backend `message` table. */
export interface ApiMessage {
	id: string;
	session_id: string;
	seq: number;
	role: 'user' | 'assistant' | 'system';
	content: string;
	created_at: number;
	visible: number;
	ooc: number;
}

export interface SendMessageResponse {
	user_message: ApiMessage;
	message: ApiMessage;
	usage?: { input: number; output: number; total: number };
	model?: string;
}

/** Payload of the SSE `done` frame — the two persisted rows from the stream. */
export interface StreamDonePayload {
	user_message: ApiMessage;
	message: ApiMessage;
}

/** Callbacks for the SSE streamed reply (`streamMessage`). */
export interface StreamHandlers {
	/** Fired per `delta` frame with the next piece of the reply text. */
	onDelta?: (text: string) => void;
	/** Fired once when the reply completes; carries the stored rows. */
	onDone?: (payload: StreamDonePayload) => void;
	/** Fired if the backend reports a mid-stream error. */
	onError?: (code: string, message: string) => void;
}

/** A structured error from the backend `{error: {code, message}}` envelope. */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

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

/**
 * Send a user turn and stream the reply as SSE. Resolves when the stream ends
 * (after `onDone` or `onError` fires). Throws `ApiError` only if the initial
 * POST fails (network, unknown session, invalid body). EventSource can't POST,
 * so the response body is read and parsed directly.
 */
export async function streamMessage(
	sessionId: string,
	content: string,
	handlers: StreamHandlers,
	signal?: AbortSignal,
): Promise<void> {
	const res = await fetch(
		`${BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content }),
			signal,
		},
	);
	if (!res.ok) throw await errorFrom(res);
	if (!res.body) throw new ApiError(res.status, 'no_stream', 'Server returned no stream');

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let idx: number;
		while ((idx = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			const parsed = parseSseFrame(frame);
			if (!parsed) continue;
			if (parsed.event === 'delta') {
				handlers.onDelta?.((parsed.data as { text: string }).text);
			} else if (parsed.event === 'done') {
				handlers.onDone?.(parsed.data as StreamDonePayload);
			} else if (parsed.event === 'error') {
				const err = parsed.data as { code: string; message: string };
				handlers.onError?.(err.code, err.message);
			}
		}
	}
}

interface SseFrame {
	event: string;
	data: unknown;
}

/** Parse one SSE frame's `event:`/`data:` lines (mirrors the backend writer). */
function parseSseFrame(raw: string): SseFrame | null {
	let event = 'message';
	let data: string | undefined;
	for (const line of raw.split(/\r?\n/)) {
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) data = line.slice(5).trimStart();
	}
	if (data === undefined) return null;
	return { event, data: JSON.parse(data) as unknown };
}

/** Build an ApiError from a non-2xx response (`{error:{code,message}}`). */
async function errorFrom(res: Response): Promise<ApiError> {
	let code = `http_${res.status}`;
	let message = `Request failed with status ${res.status}`;
	try {
		const body = (await res.json()) as { error?: { code?: string; message?: string } };
		if (body.error?.code) code = body.error.code;
		if (body.error?.message) message = body.error.message;
	} catch {
		// Non-JSON error body — keep the status fallback message.
	}
	return new ApiError(res.status, code, message);
}

/** Create a Character session on the backend. */
export function createSession(options?: {
	cardId?: string;
	personaId?: string;
	personaSource?: 'default' | 'custom';
	playerName?: string;
	startingScenarioId?: string;
}): Promise<ApiSession> {
	return request<ApiSession>('/api/sessions', {
		method: 'POST',
		body: JSON.stringify({
			class: 'character',
			...(options?.cardId ? { card_id: options.cardId } : {}),
			...(options?.personaId ? { persona_id: options.personaId } : {}),
			...(options?.personaSource ? { persona_source: options.personaSource } : {}),
			...(options?.playerName ? { player_name: options.playerName } : {}),
			...(options?.startingScenarioId ? { starting_scenario_id: options.startingScenarioId } : {}),
		}),
	});
}

/** List all sessions from the backend, newest first. */
export function listSessions(): Promise<ApiSession[]> {
	return request<ApiSession[]>('/api/sessions', { method: 'GET' });
}

/** Partially update a session (e.g. toggle favorite). */
export function patchSession(
	sessionId: string,
	patch: { favorite?: number },
): Promise<ApiSession> {
	return request<ApiSession>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
		headers: { 'Content-Type': 'application/json' },
	});
}

/** List all visible messages for a session. */
export function listSessionMessages(sessionId: string): Promise<ApiMessage[]> {
	return request<ApiMessage[]>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
		method: 'GET',
	});
}

/** List all character cards. */
export function listCards(): Promise<ApiCharacterCard[]> {
	return request<ApiCharacterCard[]>('/api/cards', {
		method: 'GET',
	});
}

/** Get a single character card by id. */
export function getCard(id: string): Promise<ApiCharacterCard> {
	return request<ApiCharacterCard>(`/api/cards/${encodeURIComponent(id)}`, {
		method: 'GET',
	});
}

// ── Character Card CRUD ──────────────────────────────────────────────────

/** Input for creating a new character card. Only `name` is required. */
export interface CreateCardInput {
	name: string;
	avatar?: string | null;
	tagline?: string;
	personality?: string;
	speech_style?: string;
	likes_and_dislikes?: string;
	scenario?: string;
	first_message?: string | null;
	relationship_state?: { affection: number; trust: number; flags: string[] };
	length_guidance?: string | null;
	avatars?: ApiAvatarOption[];
	starting_scenarios?: ApiStartingScenario[];
	default_persona?: ApiDefaultPersona | null;
	alternate_greetings?: string[];
	mes_example?: string | null;
	system_prompt?: string | null;
	post_history_instructions?: string | null;
	creator?: string | null;
	creator_notes?: string | null;
	character_version?: string | null;
	world_info?: unknown[];
	extensions?: Record<string, unknown>;
	avatar_file?: string | null;
	cover_file?: string | null;
	cover_image?: string | null;
	creator_name?: string | null;
	tags?: string[];
	description?: string | null;
	prologue_preview?: string | null;
}

/** Partial patch for updating a character card. */
export interface UpdateCardInput extends Partial<CreateCardInput> {}

/** Create a new character card. */
export function createCard(input: CreateCardInput): Promise<ApiCharacterCard> {
	return request<ApiCharacterCard>('/api/cards', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

/** Update an existing character card. */
export function updateCard(id: string, patch: UpdateCardInput): Promise<ApiCharacterCard> {
	return request<ApiCharacterCard>(`/api/cards/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
}

/** Delete a character card. */
export async function deleteCard(id: string): Promise<void> {
	await request<void>(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Story Card CRUD ─────────────────────────────────────────────────────

/** Quest entry from the backend. */
export interface ApiQuestEntry {
	id: string;
	title: string;
	objective: string;
	order: number;
	status: 'pending' | 'active' | 'completed' | 'failed';
	origin: 'source' | 'projected';
	is_ending?: boolean;
	triggers_on?: { flag: string; op: 'eq' | 'gte' | 'lte'; value: unknown }[];
}

/** NPC within a story. */
export interface ApiStoryNpc {
	id: string;
	name: string;
	description: string;
	relationship_state: { affection: number; trust: number; flags: string[] };
}

/** A reference to a Character Card from the Character Pool. */
export interface ApiCharacterReference {
	character_id: string;
	role?: string;
	introduction?: string;
	relationship_to_user?: string;
	story_notes?: string;
}

/** A story card from the backend. */
export interface ApiStoryCard {
	id: string;
	title: string;
	genre: string;
	premise: string;
	tone: string;
	description: string | null;
	cover_image: string | null;
	locations: string[];
	world_info: unknown[];
	cast_mode: 'fixed' | 'selectable' | 'open';
	character_references: ApiCharacterReference[];
	npcs: ApiStoryNpc[];
	quest_log: ApiQuestEntry[];
	starting_scenarios: ApiStartingScenario[];
	plot_flags: Record<string, unknown>;
	current_scene: string | null;
	chapter_log: unknown[];
	creator_name: string | null;
	tags: string[];
	stats: { replay_count: number; like_count: number; comment_count: number };
	favorite: number;
	created_at: number;
	updated_at: number;
}

/** Input for creating a new story card. Only `title` is required. */
export interface CreateStoryCardInput {
	title: string;
	genre?: string;
	premise?: string;
	tone?: string;
	description?: string | null;
	cover_image?: string | null;
	locations?: string[];
	world_info?: unknown[];
	cast_mode?: 'fixed' | 'selectable' | 'open';
	character_references?: ApiCharacterReference[];
	npcs?: ApiStoryNpc[];
	quest_log?: ApiQuestEntry[];
	starting_scenarios?: ApiStartingScenario[];
	plot_flags?: Record<string, unknown>;
	current_scene?: string | null;
	chapter_log?: unknown[];
	creator_name?: string;
	tags?: string[];
	stats?: { replay_count: number; like_count: number; comment_count: number };
}

/** Partial patch for updating a story card. */
export interface UpdateStoryCardInput extends Partial<CreateStoryCardInput> {}

/** List all story cards. */
export function listStories(): Promise<ApiStoryCard[]> {
	return request<ApiStoryCard[]>('/api/stories', { method: 'GET' });
}

/** Get a single story card by id. */
export function getStory(id: string): Promise<ApiStoryCard> {
	return request<ApiStoryCard>(`/api/stories/${encodeURIComponent(id)}`, { method: 'GET' });
}

/** Create a new story card. */
export function createStory(input: CreateStoryCardInput): Promise<ApiStoryCard> {
	return request<ApiStoryCard>('/api/stories', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

/** Update an existing story card. */
export function updateStory(id: string, patch: UpdateStoryCardInput): Promise<ApiStoryCard> {
	return request<ApiStoryCard>(`/api/stories/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
}

/** Delete a story card. */
export async function deleteStory(id: string): Promise<void> {
	await request<void>(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Upload an image file to the entity storage. Returns the saved filename and relative path. */
export async function uploadAvatar(
	entityType: string,
	entityId: string,
	file: File,
): Promise<{ filename: string; path: string }> {
	const formData = new FormData();
	formData.append('file', file);

	const res = await fetch(`${BASE}/api/upload/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
		method: 'POST',
		body: formData,
	});
	if (!res.ok) throw await errorFrom(res);
	return (await res.json()) as { filename: string; path: string };
}

/** Export a character card as SillyTavern V2 JSON and trigger download. */
export async function exportCardAsJson(card: ApiCharacterCard): Promise<void> {
	const res = await fetch(`${BASE}/api/cards/${encodeURIComponent(card.id)}/export.json`);
	if (!res.ok) throw await errorFrom(res);
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${card.name}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/** Export a character card as PNG with embedded card data and trigger download. */
export async function exportCardAsPng(card: ApiCharacterCard): Promise<void> {
	const avatarPath = card.avatars[0]?.image ?? card.avatar_file;
	const avatarUrl = resolveFileUrl(avatarPath);
	if (!avatarUrl) {
		throw new ApiError(400, 'no_avatar', 'Card has no avatar to export');
	}

	const url = new URL(`/api/cards/${encodeURIComponent(card.id)}/export.png`, BASE);
	url.searchParams.set('avatar_url', avatarUrl);

	const res = await fetch(url.toString());
	if (!res.ok) throw await errorFrom(res);
	const blob = await res.blob();
	const blobUrl = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = blobUrl;
	a.download = `${card.name}.png`;
	a.click();
	URL.revokeObjectURL(blobUrl);
}

/** Send a user turn and resolve with the persisted turn + assistant reply. */
export function postMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
	return request<SendMessageResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
		method: 'POST',
		body: JSON.stringify({ content }),
	});
}

// ── Persona API ─────────────────────────────────────────────────────────

/** Input for creating a new persona. Only `name` is required. */
export interface CreatePersonaInput {
	name: string;
	avatar?: string | null;
	avatar_file?: string | null;
	description?: string;
	appearance?: string;
	personality?: string;
	pronouns?: string;
}

/** Partial patch for updating a persona. */
export interface UpdatePersonaInput {
	name?: string;
	avatar?: string | null;
	avatar_file?: string | null;
	description?: string;
	appearance?: string;
	personality?: string;
	pronouns?: string;
}

/** List all personas. */
export function listPersonas(): Promise<ApiPersona[]> {
	return request<ApiPersona[]>('/api/personas', { method: 'GET' });
}

/** Get a single persona by id. */
export function getPersona(id: string): Promise<ApiPersona> {
	return request<ApiPersona>(`/api/personas/${encodeURIComponent(id)}`, { method: 'GET' });
}

/** Create a new persona. */
export function createPersona(input: CreatePersonaInput): Promise<ApiPersona> {
	return request<ApiPersona>('/api/personas', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

/** Update an existing persona. */
export function updatePersona(id: string, patch: UpdatePersonaInput): Promise<ApiPersona> {
	return request<ApiPersona>(`/api/personas/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		body: JSON.stringify(patch),
	});
}

/** Delete a persona. */
export async function deletePersona(id: string): Promise<void> {
	await request<void>(`/api/personas/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Session / Message deletion ──────────────────────────────────────────

/** Delete a session and its messages. */
export async function deleteSessionApi(id: string): Promise<void> {
	await request<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Delete all messages for a session. */
export async function deleteSessionMessages(id: string): Promise<void> {
	await request<void>(`/api/sessions/${encodeURIComponent(id)}/messages`, { method: 'DELETE' });
}
