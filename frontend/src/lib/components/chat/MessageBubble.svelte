<script lang="ts">
	import { parseMessage } from '$lib/messageParse';
	import type { ChatMessage } from '$lib/types/chat';
	import Avatar from './Avatar.svelte';

	let {
		message,
		name,
		initials,
		hue
	}: {
		message: ChatMessage;
		name: string;
		initials: string;
		hue: number;
	} = $props();

	const segments = $derived(parseMessage(message.content));
</script>

<div class="bubble">
	<header class="bubble__header">
		<Avatar {initials} {hue} size={28} />
		<span class="bubble__name">{name}</span>
	</header>

	<div class="bubble__body">
		{#each segments as seg, i (i)}
			<p
				class="bubble__seg"
				class:bubble__seg--dialogue={seg.type === 'dialogue'}
				class:bubble__seg--action={seg.type === 'action'}
			>
				{seg.text}
			</p>
		{/each}
	</div>
</div>

<style>
	.bubble {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 72%;
		align-self: flex-start;
		/* AI messages intentionally have NO visible bubble background. */
	}

	.bubble__header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-left: 2px;
	}
	.bubble__name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
	}

	.bubble__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0 2px;
	}
	.bubble__seg {
		margin: 0;
		font-size: var(--font-size-base);
		line-height: 1.55;
		color: var(--ai-narration);
		font-weight: var(--font-weight-regular);
	}
	.bubble__seg--dialogue {
		color: var(--ai-dialogue);
		font-weight: var(--font-weight-bold);
		font-size: var(--font-size-lg);
		line-height: 1.4;
	}
	.bubble__seg--action {
		font-style: italic;
		color: var(--text-muted);
	}
</style>
