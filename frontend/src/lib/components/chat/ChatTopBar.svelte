<script lang="ts">
	import { activeSession, chat, openCardInfoModal } from '$lib/state/chat.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	const LENGTHS = ['Short', 'Normal', 'Long'] as const;

	const session = $derived(activeSession());

	let lengthOpen = $state(false);
	let lengthEl = $state<HTMLDivElement | undefined>();

	// Close dropdown when clicking outside.
	$effect(() => {
		function onDocClick(e: MouseEvent): void {
			const target = e.target as Node;
			if (lengthEl && !lengthEl.contains(target)) lengthOpen = false;
		}
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick);
	});

	function handleTitleClick(): void {
		const cardId = session?.cardId ?? 'yehwa';
		void openCardInfoModal(cardId);
	}
</script>

<header class="top-bar">
	<button class="icon-btn" title="Back" onclick={() => history.back()}>
		<Icon name="chevron-left" size={22} />
	</button>

	<button class="title-btn" onclick={handleTitleClick}>
		<Avatar initials={session?.initials ?? '?'} hue={session?.hue ?? 170} size={28}>
			{#if session?.avatarUrl}
				<img src={session.avatarUrl} alt={session.title} />
			{/if}
		</Avatar>
		<span class="title-btn__text">{session?.title ?? 'Playime'}</span>
	</button>

	<div class="spacer"></div>

	<div class="length-wrap" bind:this={lengthEl}>
		<button
			class="length-btn"
			aria-haspopup="listbox"
			aria-expanded={lengthOpen}
			onclick={() => (lengthOpen = !lengthOpen)}
		>
			<Icon name="sliders" size={15} />
			<span>{chat.responseLength}</span>
			<span class="length-btn__chevron"><Icon name="chevron-down" size={13} /></span>
		</button>

		{#if lengthOpen}
			<div class="dropdown dropdown--right" role="listbox">
				{#each LENGTHS as length}
					<button
						class="dropdown__item"
						class:dropdown__item--selected={chat.responseLength === length}
						role="option"
						aria-selected={chat.responseLength === length}
						onclick={() => {
							chat.responseLength = length;
							lengthOpen = false;
						}}
					>
						{length}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<button class="icon-btn icon-btn--bell" title="Notifications">
		<Icon name="notifications" size={20} />
		<span class="bell-dot" aria-hidden="true"></span>
	</button>
</header>

<style>
	.top-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		height: var(--top-bar-height);
		padding: 0 var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--bg-raised);
		position: relative;
		z-index: 10;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.icon-btn:hover {
		background: var(--accent-soft);
		color: var(--icon-hover);
	}
	.icon-btn--bell {
		position: relative;
	}
	.bell-dot {
		position: absolute;
		top: 7px;
		right: 7px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg-raised);
	}

	/* ---- Title (avatar + name, click opens card) ---- */
	.title-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
		border-radius: var(--radius-pill);
		transition: background var(--transition-fast);
	}
	.title-btn:hover {
		background: var(--accent-soft);
	}
	.title-btn__text {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.spacer {
		flex: 1;
	}

	/* ---- Right dropdown ---- */
	.length-wrap {
		position: relative;
	}
	.length-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		transition: border-color var(--transition-fast), color var(--transition-fast);
	}
	.length-btn:hover {
		border-color: var(--accent-muted);
		color: var(--text);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 170px;
		padding: var(--space-1);
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.dropdown__item {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.dropdown__item:hover {
		background: var(--accent-soft);
		color: var(--text);
	}
	.dropdown__item--selected {
		color: var(--accent);
		font-weight: var(--font-weight-medium);
	}
</style>
