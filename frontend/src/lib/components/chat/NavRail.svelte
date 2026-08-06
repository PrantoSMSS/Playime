<script lang="ts">
	import { nav } from '$lib/state/nav.svelte';
	import type { NavView } from '$lib/state/nav.svelte';
	import Icon from './Icon.svelte';

	// No credit/currency section — this is a local-first tool, not a hosted
	// product (CLAUDE.md: explicitly skip monetization plumbing).
	type NavItemId = Exclude<NavView, 'conversation'>;
	const NAV_ITEMS: { id: NavItemId; label: string }[] = [
		{ id: 'search', label: 'Search' },
		{ id: 'story', label: 'Story' },
		{ id: 'character', label: 'Character' },
		{ id: 'chats', label: 'Chats' },
		{ id: 'my-titles', label: 'Personas' },
		{ id: 'notifications', label: 'Notifications' }
	];
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
				class:nav-item--active={nav.activeView === item.id}
				title={item.label}
				onclick={() => (nav.activeView = item.id)}
			>
				<span class="nav-item__icon"><Icon name={item.id} size={20} /></span>
				<span class="nav-item__label">{item.label}</span>
			</button>
		{/each}
	</nav>
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
</style>
