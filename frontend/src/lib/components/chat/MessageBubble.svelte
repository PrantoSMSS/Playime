<script lang="ts">
	import { parseMessage } from '$lib/messageParse';
	import type { ChatMessage } from '$lib/types/chat';
	import Avatar from './Avatar.svelte';

	let {
		message,
		name,
		initials,
		hue,
		avatarUrl
	}: {
		message: ChatMessage;
		name: string;
		initials: string;
		hue: number;
		avatarUrl?: string;
	} = $props();

	const segments = $derived(parseMessage(message.content));
</script>

<div class="bubble">
	<header class="bubble__header">
		<Avatar {initials} {hue} size={28}>
			{#if avatarUrl}
				<img src={avatarUrl} alt={name} />
			{/if}
		</Avatar>
		<span class="bubble__name">{name}</span>
	</header>

	<div class="bubble__box" aria-live="polite">
		{#if message.streaming && message.content === ''}
			<span class="bubble__dots" aria-hidden="true"><span></span><span></span><span></span></span>
		{:else}
			{#each segments as seg, i (i)}
				<span
					class="bubble__seg"
					class:bubble__seg--dialogue={seg.type === 'dialogue'}
				>{seg.text}</span>
			{/each}
		{/if}
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
	 * Narration (including stage directions) and dialogue live inside this
	 * single bubble. */
	.bubble__box {
		background: var(--assistant-bg);
		border: 1px solid var(--assistant-border);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
		font-size: var(--font-size-base);
		line-height: 1.55;
	}

	/* Everything that isn't speech — narration and stage directions alike —
	 * reads italic + muted. Dialogue is slightly bold + normal, so spoken
	 * lines lead the reading. */
	.bubble__seg {
		color: var(--ai-narration);
		font-style: italic;
	}
	.bubble__seg--dialogue {
		color: var(--ai-dialogue);
		font-style: normal;
		font-weight: var(--font-weight-medium);
	}

	/* Typing indicator: the live streaming placeholder shows animated dots
	 * until the first delta fills its content (then it renders as a normal
	 * message, still streaming). */
	.bubble__dots {
		display: inline-flex;
		gap: 5px;
		align-items: center;
	}
	.bubble__dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ai-narration);
		animation: bubble-dots 1.2s ease-in-out infinite;
	}
	.bubble__dots span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.bubble__dots span:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes bubble-dots {
		0%,
		60%,
		100% {
			opacity: 0.25;
		}
		30% {
			opacity: 1;
		}
	}
</style>
