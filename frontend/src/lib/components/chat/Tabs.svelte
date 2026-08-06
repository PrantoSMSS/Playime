<script lang="ts">
	let {
		tabs,
		active,
		onchange,
	}: {
		tabs: Array<{ id: string; label: string }>;
		active: string;
		onchange: (id: string) => void;
	} = $props();
</script>

<div class="tabs">
	{#each tabs as tab (tab.id)}
		<button
			class="tabs__tab"
			class:tabs__tab--active={active === tab.id}
			onclick={() => onchange(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		padding: 0 var(--space-5);
		border-bottom: 1px solid var(--border);
		gap: 0;
	}

	.tabs__tab {
		flex: 1;
		padding: var(--space-3) var(--space-2);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
		text-align: center;
	}
	.tabs__tab:hover {
		color: var(--text);
	}
	.tabs__tab--active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
</style>
