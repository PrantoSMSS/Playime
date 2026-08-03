/**
 * Shared chat types for the shell.
 *
 * These mirror the backend's `Session`/`Message` shapes closely enough that
 * checklist item 5 (frontend → backend wiring) only needs to swap the sample
 * data in `$lib/state/chat.svelte` for real fetch calls — the components
 * already consume `ChatMessage[]`.
 */

/** A past session shown in the nav rail History list. */
export interface ChatSession {
	id: string;
	title: string;
	kind: 'story' | 'character';
	/** Short last-message preview line shown under the title. */
	preview: string;
	/** 1–2 initials rendered in the avatar (until real images exist). */
	initials: string;
	/** Base hue for the avatar gradient (0–360). */
	hue: number;
}

/** One turn in the message list. `content` is the raw text; the renderer
 *  splits narration / dialogue / action styling (see `$lib/messageParse.ts`). */
export interface ChatMessage {
	id: string;
	role: 'assistant' | 'user';
	content: string;
	createdAt: number;
}
