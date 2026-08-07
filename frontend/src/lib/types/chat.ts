/**
 * Shared chat types for the shell.
 *
 * These mirror the backend's `Session`/`Message` shapes closely enough that
 * checklist item 5 (frontend → backend wiring) only needs to swap the sample
 * data in `$lib/state/chat.svelte` for real fetch calls — the components
 * already consume `ChatMessage[]`.
 */

/** A quest entry from the story state. */
export interface QuestEntry {
	id: string;
	title: string;
	objective: string;
	order: number;
	status: 'pending' | 'active' | 'completed' | 'failed';
	origin: string;
	is_ending?: boolean;
	triggers_on?: { flag: string; op: 'eq' | 'gte' | 'lte'; value: unknown }[];
}

/** A chapter summary entry. */
export interface ChapterEntry {
	title: string;
	summary: string;
}

/** A past session shown in the nav rail Chats list. */
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
	/** Character card ID this session was created from (set on New Play). */
	cardId?: string;
	/** Story card ID this session was created from (set on New Play for story sessions). */
	storyCardId?: string;
	/** Persona ID used when creating this session. */
	personaId?: string;
	/** Whether the persona was default or custom. */
	personaSource?: 'default' | 'custom';
	/** Player name for the persona. */
	playerName?: string;
	/** Starting scenario ID used when creating this session. */
	startingScenarioId?: string;
	/** Avatar image URL from the selected avatar option. */
	avatarUrl?: string;
	/** 1 = user has marked this session as favorite. */
	favorite: number;
	/** Timestamp when the session was created (ms since epoch). */
	createdAt: number;
	/** Story-only: current quest log state (parsed from session.quest_log_state). */
	questLogState?: QuestEntry[];
	/** Story-only: current plot flags (parsed from session.plot_flags). */
	plotFlags?: Record<string, unknown>;
	/** Story-only: chapter summaries (parsed from session.chapter_log). */
	chapterLog?: ChapterEntry[];
}

/** One turn in the message list. `content` is the raw text; the renderer
 *  splits narration (incl. stage directions) / dialogue styling (see
 *  `$lib/messageParse.ts`). */
export interface ChatMessage {
	id: string;
	role: 'assistant' | 'user';
	content: string;
	createdAt: number;
	/** UI-only marker on the live streaming placeholder being filled
	 *  token-by-token; persisted messages never set it. */
	streaming?: boolean;
}
