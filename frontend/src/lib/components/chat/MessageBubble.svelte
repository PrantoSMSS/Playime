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

	<div class="bubble__box">
		{#each segments as seg, i (i)}
			<span
				class="bubble__seg"
				class:bubble__seg--dialogue={seg.type === 'dialogue'}
				class:bubble__seg--action={seg.type === 'action'}
			>{seg.text}</span>
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

	/* One block for the whole message — mirrors the user pill's shape and
	 * padding, but with its own color (--assistant-bg / --assistant-border).
	 * Narration, action, and dialogue all live inside this single bubble. */
	.bubble__box {
		background: var(--assistant-bg);
		border: 1px solid var(--assistant-border);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
		font-size: var(--font-size-base);
		line-height: 1.55;
	}

	.bubble__seg {
		color: var(--ai-narration);
		font-weight: var(--font-weight-regular);
	}
	.bubble__seg--dialogue {
		color: var(--ai-dialogue);
		font-weight: var(--font-weight-bold);
	}
	.bubble__seg--action {
		font-style: italic;
		color: var(--ai-action);
	}
</style>
