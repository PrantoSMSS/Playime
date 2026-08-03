/**
 * Splits an assistant message into visually-distinct segments for the
 * MessageBubble: quoted lines render as dialogue, `*…*` spans as action,
 * everything else as narration (docs/PLAYIME_PROMPT_SPEC §1 + the shell's
 * message-styling rules).
 *
 * - `"…"` / `“…”` → dialogue   (bold, full-contrast; the surrounding
 *                                quotation marks are stripped from view)
 * - `*…*`          → action     (italic narration, e.g. stage direction;
 *                                the surrounding `*` are stripped from view)
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
			// Quotation marks are a markup convention, not part of the line —
			// drop them so the dialogue reads plainly. The bold full-contrast
			// styling still marks it as dialogue.
			segments.push({ type: 'dialogue', text: token.slice(1, -1) });
		} else {
			// The surrounding asterisks are a markup convention, not part of
			// the text — drop them so the stage direction reads plainly.
			segments.push({ type: 'action', text: token.slice(1, -1) });
		}
		last = match.index + token.length;
	}

	if (last < content.length) pushNarration(content.slice(last));
	return mergeAdjacent(segments);

	// Preserve whitespace (including space-only runs between tokens) so the
	// segments can be rendered inline — one flowing block — without losing
	// the original word spacing.
	function pushNarration(text: string): void {
		if (text.length > 0) segments.push({ type: 'narration', text });
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
