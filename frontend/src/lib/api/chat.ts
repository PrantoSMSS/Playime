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
	if (!res.ok) {
		let code = `http_${res.status}`;
		let message = `Request failed with status ${res.status}`;
		try {
			const body = (await res.json()) as { error?: { code?: string; message?: string } };
			if (body.error?.code) code = body.error.code;
			if (body.error?.message) message = body.error.message;
		} catch {
			// Non-JSON error body — keep the status fallback message.
		}
		throw new ApiError(res.status, code, message);
	}
	return (await res.json()) as T;
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
