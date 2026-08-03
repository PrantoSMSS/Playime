/**
 * Splits an assistant message into visually-distinct segments for the
 * MessageBubble: quoted lines render as dialogue, `*…*` spans as action,
 * everything else as narration (docs/PLAYIME_PROMPT_SPEC §1 + the shell's
 * message-styling rules).
 *
 * - `"…"` / `“…”` → dialogue   (bold, full-contrast)
 * - `*…*`          → action     (italic narration, e.g. stage direction)
 * - anything else  → narration  (muted, regular weight)
 */
export type MessageSegment =
	| { type: 'narration'; text: string }
	| { type: 'action'; text: string }
	| { type: 'dialogue'; text: string };

const TOKEN = /"([^"\\]|\\.)*"|“([^“”])*?”|\*[^*\n]+\*/g;

export function parseMessage(content: string): MessageSegment[] {
	const segments: MessageSegment[] = [];
	let last = 0;

	let match: RegExpExecArray | null;
	while ((match = TOKEN.exec(content)) !== null) {
		if (match.index > last) pushNarration(content.slice(last, match.index));

		const token = match[0];
		if (token.startsWith('"') || token.startsWith('“')) {
			segments.push({ type: 'dialogue', text: token });
		} else {
			segments.push({ type: 'action', text: token });
		}
		last = match.index + token.length;
	}

	if (last < content.length) pushNarration(content.slice(last));
	return mergeAdjacent(segments);

	function pushNarration(text: string): void {
		if (text.trim().length > 0) segments.push({ type: 'narration', text });
	}
}

/** Collapse consecutive same-type segments so the bubble doesn't stack a
 *  run of identical styling lines for adjacent tokens. */
function mergeAdjacent(segments: MessageSegment[]): MessageSegment[] {
	const out: MessageSegment[] = [];
	for (const seg of segments) {
		const prev = out[out.length - 1];
		if (prev && prev.type === seg.type) {
			out[out.length - 1] = { type: seg.type, text: prev.text + seg.text };
		} else {
			out.push(seg);
		}
	}
	return out;
}
