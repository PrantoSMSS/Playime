/**
 * Splits a message into visually-distinct segments for the message bubbles.
 *
 * There are exactly two kinds of text:
 *
 * - `*…*` → narration (italic, muted; asterisks stripped from display)
 * - anything else → dialogue (normal text)
 */
export type MessageSegment =
	| { type: 'narration'; text: string }
	| { type: 'dialogue'; text: string };

const TOKEN = /\*[^*\n]+\*/g;

export function parseMessage(content: string): MessageSegment[] {
	const segments: MessageSegment[] = [];
	let last = 0;

	let match: RegExpExecArray | null;
	while ((match = TOKEN.exec(content)) !== null) {
		if (match.index > last) pushDialogue(content.slice(last, match.index));

		// `*…*` narration — strip asterisks from display, render as italic.
		pushNarration(match[0].slice(1, -1));
		last = match.index + match[0].length;
	}

	if (last < content.length) pushDialogue(content.slice(last));
	return mergeAdjacent(segments);

	function pushNarration(text: string): void {
		if (text.length > 0) segments.push({ type: 'narration', text });
	}

	function pushDialogue(text: string): void {
		if (text.length > 0) segments.push({ type: 'dialogue', text });
	}
}

/** Collapse consecutive same-type segments. Adjacent same-type segments are
 *  only separated by whitespace, so a single space join preserves spacing;
 *  HTML collapses any leftover runs. */
function mergeAdjacent(segments: MessageSegment[]): MessageSegment[] {
	const out: MessageSegment[] = [];
	for (const seg of segments) {
		const prev = out[out.length - 1];
		if (prev && prev.type === seg.type) {
			out[out.length - 1] = { type: seg.type, text: `${prev.text} ${seg.text}` };
		} else {
			out.push(seg);
		}
	}
	return out;
}
