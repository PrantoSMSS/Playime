<script lang="ts">
	let {
		label = 'Delete this?',
		onconfirm,
		disabled = false,
	}: {
		label?: string;
		onconfirm: () => void;
		disabled?: boolean;
	} = $props();

	let showConfirm = $state(false);
</script>

{#if !showConfirm}
	<button
		class="delete-btn"
		onclick={() => (showConfirm = true)}
		aria-label={label}
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
		</svg>
		Delete
	</button>
{:else}
	<div class="delete-confirm">
		<span>{label}</span>
		<button class="delete-confirm__yes" onclick={onconfirm} disabled={disabled}>
			{disabled ? '...' : 'Yes'}
		</button>
		<button class="delete-confirm__no" onclick={() => (showConfirm = false)}>
			No
		</button>
	</div>
{/if}

<style>
	.delete-btn {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
	}
	.delete-btn:hover {
		color: #ef4444;
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}

	.delete-confirm {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.delete-confirm__yes {
		padding: var(--space-1) var(--space-3);
		background: #ef4444;
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: opacity var(--transition-fast);
	}
	.delete-confirm__yes:hover:not(:disabled) {
		opacity: 0.9;
	}
	.delete-confirm__yes:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.delete-confirm__no {
		padding: var(--space-1) var(--space-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}
	.delete-confirm__no:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}
</style>
