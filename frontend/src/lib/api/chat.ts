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

/** A row from the backend `session` table. */
export interface ApiSession {
	id: string;
	class: 'character' | 'story';
	created_at: number;
	provider: string;
	model: string | null;
	small_model: string | null;
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
	const res = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
	if (!res.ok) throw await errorFrom(res);
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
export function createSession(): Promise<ApiSession> {
	return request<ApiSession>('/api/sessions', {
		method: 'POST',
		body: JSON.stringify({ class: 'character' }),
	});
}

/** Send a user turn and resolve with the persisted turn + assistant reply. */
export function postMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
	return request<SendMessageResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
		method: 'POST',
		body: JSON.stringify({ content }),
	});
}
