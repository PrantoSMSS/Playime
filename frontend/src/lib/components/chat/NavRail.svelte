<script lang="ts">
	import { chat } from '$lib/state/chat.svelte';
	import type { NavId } from '$lib/state/chat.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	// No credit/currency section — this is a local-first tool, not a hosted
	// product (AGENTS.md: explicitly skip monetization plumbing).
	const NAV_ITEMS: { id: NavId; label: string }[] = [
		{ id: 'search', label: 'Search' },
		{ id: 'story', label: 'Story' },
		{ id: 'character', label: 'Character' },
		{ id: 'my-titles', label: 'My Titles' },
		{ id: 'notifications', label: 'Notifications' }
	];

	const filteredSessions = $derived(chat.sessions.filter((s) => s.kind === chat.historyTab));
</script>

<aside class="nav-rail">
	<div class="brand">
		<span class="brand__mark"><Icon name="spark" size={18} /></span>
		<span class="brand__name">Playime</span>
	</div>

	<nav class="nav-items" aria-label="Primary">
		{#each NAV_ITEMS as item}
			<button
				class="nav-item"
				class:nav-item--active={chat.nav === item.id}
				title={item.label}
				onclick={() => (chat.nav = item.id)}
			>
				<span class="nav-item__icon"><Icon name={item.id} size={20} /></span>
				<span class="nav-item__label">{item.label}</span>
			</button>
		{/each}
	</nav>

	<section class="history">
		<div class="history__header">
			<span class="history__title">History</span>
			<div class="history__tabs" role="tablist">
				<button
					class="history-tab"
					class:history-tab--active={chat.historyTab === 'story'}
					role="tab"
					onclick={() => (chat.historyTab = 'story')}
				>
					Story
				</button>
				<button
					class="history-tab"
					class:history-tab--active={chat.historyTab === 'character'}
					role="tab"
					onclick={() => (chat.historyTab = 'character')}
				>
					Character
				</button>
			</div>
		</div>

		<div class="history__list">
			{#if filteredSessions.length === 0}
				<p class="history__empty">No {chat.historyTab} sessions yet.</p>
			{/if}
			{#each filteredSessions as s}
				<button
					class="history-item"
					class:history-item--active={chat.activeSessionId === s.id}
					onclick={() => (chat.activeSessionId = s.id)}
				>
					<Avatar initials={s.initials} hue={s.hue} size={34} square />
					<span class="history-item__text">
						<span class="history-item__title">{s.title}</span>
						<span class="history-item__preview">{s.preview}</span>
					</span>
				</button>
			{/each}
		</div>
	</section>
</aside>

<style>
	.nav-rail {
		display: flex;
		flex-direction: column;
		width: var(--nav-rail-width);
		flex-shrink: 0;
		height: 100%;
		background: var(--surface);
		border-right: 1px solid var(--border);
	}

	/* ---- Brand ---- */
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-5) var(--space-4) var(--space-4);
	}
	.brand__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		background: linear-gradient(145deg, var(--accent-muted), var(--accent-soft));
		color: var(--accent);
		border: 1px solid var(--border);
	}
	.brand__name {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.01em;
	}

	/* ---- Nav items ---- */
	.nav-items {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.nav-item:hover {
		background: var(--bg-raised);
		color: var(--icon-hover);
	}
	.nav-item--active {
		background: var(--accent-soft);
		color: var(--icon-active);
	}
	.nav-item--active .nav-item__label {
		color: var(--text);
		font-weight: var(--font-weight-medium);
	}
	.nav-item__icon {
		flex-shrink: 0;
		display: inline-flex;
	}
	.nav-item__label {
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	/* ---- History ---- */
	.history {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		border-top: 1px solid var(--border);
		margin-top: var(--space-3);
	}
	.history__header {
		padding: var(--space-4) var(--space-4) var(--space-2);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.history__title {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.history__tabs {
		display: flex;
		gap: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 2px;
	}
	.history-tab {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.history-tab--active {
		background: var(--accent-muted);
		color: var(--text);
		font-weight: var(--font-weight-medium);
	}

	.history__list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3) var(--space-4);
	}
	.history__empty {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		padding: var(--space-2) var(--space-3);
		margin: 0;
	}
	.history-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		text-align: left;
		transition: background var(--transition-fast);
	}
	.history-item:hover {
		background: var(--bg-raised);
	}
	.history-item--active {
		background: var(--accent-soft);
	}
	.history-item__text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}
	.history-item__title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.history-item__preview {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
