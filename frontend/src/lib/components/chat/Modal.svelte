<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		onclose,
		backdropclose = true,
		hidden = false,
		children,
		header,
		tabs,
		footer,
		'aria-labelledby': ariaLabelledBy,
	}: {
		title?: string;
		onclose: () => void;
		backdropclose?: boolean;
		hidden?: boolean;
		children?: Snippet;
		header?: Snippet;
		tabs?: Snippet;
		footer?: Snippet;
		'aria-labelledby'?: string;
	} = $props();

	function handleBackdropClick(e: MouseEvent): void {
		if (backdropclose && e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !hidden}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
	<div class="modal" role="dialog" aria-labelledby={ariaLabelledBy}>
		{#if header}
			{@render header()}
		{:else if title}
			<div class="modal__header">
				<h2 class="modal__header-title">{title}</h2>
				<button class="modal__close" onclick={onclose} aria-label="Close">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/if}

		{#if tabs}
			{@render tabs()}
		{/if}

		<div class="modal__body">
			{#if children}
				{@render children()}
			{/if}
		</div>

		{#if footer}
			<div class="modal__footer">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--space-4);
	}

	.modal {
		position: relative;
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
		max-width: 560px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}

	.modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	.modal__header-title {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__close {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--bg-raised);
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.modal__close:hover {
		background: var(--accent-soft);
		color: var(--icon-hover);
	}

	.modal__body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
	}

	.modal__footer {
		padding: var(--space-3) var(--space-5);
		border-top: 1px solid var(--border);
	}
</style>
