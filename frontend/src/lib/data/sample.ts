/**
 * Sample data for the chat shell (checklist item 4).
 *
 * Stands in for the backend until item 5 wires the real API. Only one test
 * character exists for now — Yehwa — so every session here is a past
 * conversation with that card (no story sessions yet, no other characters).
 * The messages exercise the narration / dialogue rendering: quoted lines
 * (`"..."`) render as bold dialogue; everything else — narration and `*...*`
 * stage directions alike — renders as italic narration (see
 * `$lib/messageParse.ts`). The opening message of each session is the
 * character's first line, so it is quoted dialogue.
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
		avatarUrl: 'https://i.pravatar.cc/300?img=32',
	},
	{
		id: 'yehwa-plum',
		title: 'Yehwa',
		kind: 'character',
		preview: 'You picked up the plum blossom tea again, I see.',
		initials: 'YE',
		hue: 172,
		avatarUrl: 'https://i.pravatar.cc/300?img=32',
	},
	{
		id: 'yehwa-night-watch',
		title: 'Yehwa',
		kind: 'character',
		preview: 'The east wall is quiet tonight, Senior.',
		initials: 'YE',
		hue: 172,
		avatarUrl: 'https://i.pravatar.cc/300?img=32',
	},
	{
		id: 'miko-test',
		title: 'Miko',
		kind: 'character',
		preview: 'Hey. You gonna let me in, or do I have to cry on your doorstep?',
		initials: 'MI',
		hue: 320,
		cardId: '215fb191-9d97-45eb-8029-394ab92fe0d7',
		avatarUrl: 'https://i.pravatar.cc/300?img=1',
	},
];

function msg(role: ChatMessage['role'], content: string, minutesAgo: number): ChatMessage {
	return { id: crypto.randomUUID(), role, content, createdAt: now - minutesAgo * MINUTE };
}

export const SAMPLE_MESSAGES_BY_SESSION: Record<string, ChatMessage[]> = {
	'yehwa-evening': [
		msg(
			'assistant',
			'"The evening air on the training pavilion is crisp, and you have been loitering at the edge of the practice yard for the better part of an hour, Junior."',
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
		msg('assistant', '"You are quiet today, Junior. Even for you."', 40),
		msg('user', 'Just thinking, Senior. Nothing important.', 39),
		msg(
			'assistant',
			'"Thinking that pulls at the brow like that is rarely \'nothing.\'" *A cup of plum blossom tea is set before you.* "Drink. Then tell me."',
			38,
		),
	],
	'yehwa-night-watch': [
		msg('assistant', '"The east wall is quiet tonight. Too quiet for a full moon."', 300),
		msg('user', 'Do you expect trouble, Senior?', 299),
		msg(
			'assistant',
			'"I expect the world to stay interesting." *Yehwa\'s hand rests on the hilt, easy and practiced.* "Keep your eyes open."',
			298,
		),
	],
	'miko-test': [
		msg(
			'assistant',
			'*She stands in the doorway, soaked, hair clinging to her face — and smiles like no time has passed at all.* ...Hey. You gonna let me in, or do I have to cry on your doorstep?',
			5,
		),
	],
};
