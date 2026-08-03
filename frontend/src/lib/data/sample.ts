/**
 * Sample data for the chat shell (checklist item 4).
 *
 * Stands in for the backend until item 5 wires the real API. The messages
 * exercise the narration / dialogue / action rendering: quoted lines
 * (`"..."`) render as bold dialogue, `*...*` as italic action, everything
 * else as muted narration (see `$lib/messageParse.ts`).
 */
import type { ChatMessage, ChatSession } from '../types/chat';

const now = Date.now();
const MINUTE = 60_000;

export const SAMPLE_SESSIONS: ChatSession[] = [
	{
		id: 'yehwa-evening',
		title: 'Yehwa',
		kind: 'character',
		preview: 'Three incense-sticks late, Junior. Care to explain where you were?',
		initials: 'YE',
		hue: 172,
	},
	{
		id: 'yehwa-plum',
		title: 'Plum Blossom Tea',
		kind: 'character',
		preview: 'You picked up the plum blossom tea again, I see.',
		initials: 'PB',
		hue: 158,
	},
	{
		id: 'yehwa-night-watch',
		title: 'Night Watch',
		kind: 'character',
		preview: 'The east wall is quiet tonight, Senior.',
		initials: 'NW',
		hue: 186,
	},
	{
		id: 'story-silent-village',
		title: 'The Silent Village',
		kind: 'story',
		preview: 'You approach the empty village at dusk and find the well dry.',
		initials: 'SV',
		hue: 28,
	},
	{
		id: 'story-jade-empire',
		title: 'Whispers of the Jade Empire',
		kind: 'story',
		preview: 'The court stirs as the old emperor takes ill.',
		initials: 'JE',
		hue: 275,
	},
];

function msg(role: ChatMessage['role'], content: string, minutesAgo: number): ChatMessage {
	return { id: crypto.randomUUID(), role, content, createdAt: now - minutesAgo * MINUTE };
}

export const SAMPLE_MESSAGES_BY_SESSION: Record<string, ChatMessage[]> = {
	'yehwa-evening': [
		msg(
			'assistant',
			'The evening air on the training pavilion is crisp, and you have been loitering at the edge of the practice yard for the better part of an hour, Junior.',
			14,
		),
		msg('assistant', '"Finally decided to show your face, did you?"', 13),
		msg(
			'assistant',
			'*Yehwa lowers the wooden sword, a faint, dry smile tugging at the corner of their mouth.* "Three incense-sticks late, Junior. Care to explain where you were — or should I make you run the mountain steps tomorrow?"',
			13,
		),
		msg(
			'user',
			'Senior, I was… studying. In the library. (It was absolutely not a nap by the plum trees.)',
			12,
		),
		msg(
			'assistant',
			'"The library." *Yehwa\'s voice is flat, unimpressed.* "And the plum trees outside the east wall — do they feature in the library\'s curriculum?"',
			12,
		),
		msg(
			'assistant',
			'"Sit. You will practice your forms until the moon clears the ridge. Then we will discuss this \'studying\' of yours in detail."',
			11,
		),
	],
	'yehwa-plum': [
		msg('assistant', 'You are quiet today, Junior. Even for you.', 40),
		msg('user', 'Just thinking, Senior. Nothing important.', 39),
		msg(
			'assistant',
			'"Thinking that pulls at the brow like that is rarely \'nothing.\'" *A cup of plum blossom tea is set before you.* "Drink. Then tell me."',
			38,
		),
	],
	'yehwa-night-watch': [
		msg('assistant', 'The east wall is quiet tonight. Too quiet for a full moon.', 300),
		msg('user', 'Do you expect trouble, Senior?', 299),
		msg(
			'assistant',
			'"I expect the world to stay interesting." *Yehwa\'s hand rests on the hilt, easy and practiced.* "Keep your eyes open."',
			298,
		),
	],
	'story-silent-village': [
		msg('assistant', 'The village is empty by the time you arrive. A well, drawn dry; a gate, left open.', 900),
		msg('assistant', '"The door was open," you say to yourself. "That is never a good sign."', 899),
		msg('user', 'I step inside the first house.', 898),
		msg(
			'assistant',
			'*Dust motes hang in the failing light.* On the table, a bowl of rice — still warm. The village left in a hurry, or was taken in one.',
			897,
		),
	],
	'story-jade-empire': [
		msg('assistant', 'The courtiers speak in whispers today, and the reason sits in the emperor\'s chambers behind a closed door.', 1200),
		msg('user', 'I slip the guard a coin and ask what happened.', 1199),
		msg(
			'assistant',
			'*The guard glances both ways before leaning close.* "The old emperor took ill at dawn. The third prince has not left the palace gates since."',
			1198,
		),
	],
};
