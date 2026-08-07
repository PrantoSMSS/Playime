/**
 * Navigation / routing state.
 *
 * Owns which page is currently active (`activeView`) and the Chats
 * sub-tab filter (`chatsTab`). Consumed by NavRail, ChatsList,
 * +page.svelte, and ChatTopBar.
 *
 * `'conversation'` is an implicit view — not shown in the nav rail,
 * only set by ChatsList when a session is clicked.
 */

/** All possible views, including the implicit 'conversation' view. */
export type NavView =
	| 'home'
	| 'search'
	| 'story'
	| 'character'
	| 'chats'
	| 'personas'
	| 'notifications'
	| 'conversation';

/** Which page is currently active. */
export const nav = $state({
	activeView: 'home' as NavView,
});

/** Chats sub-tab filter. */
export type ChatsTab = 'story' | 'character';

/** Active Chats tab (Story / Character). */
export const chatsTab = $state({
	tab: 'character' as ChatsTab,
});
