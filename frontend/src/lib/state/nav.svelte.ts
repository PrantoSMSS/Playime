/**
 * Navigation / routing state.
 *
 * Owns which page is currently active (`activeView`) and the Records
 * sub-tab filter (`recordsTab`). Consumed by NavRail, ChatsList,
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
	| 'records'
	| 'personas'
	| 'notifications'
	| 'conversation';

/** Which page is currently active. */
export const nav = $state({
	activeView: 'home' as NavView,
});

/** Records sub-tab filter. */
export type RecordsTab = 'story' | 'character';

/** Active Records tab (Story / Character). */
export const recordsTab = $state({
	tab: 'character' as RecordsTab,
});
