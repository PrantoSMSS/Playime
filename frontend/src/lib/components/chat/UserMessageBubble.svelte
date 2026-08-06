<script lang="ts">
	import { parseMessage } from '$lib/messageParse';
	import type { ChatMessage } from '$lib/types/chat';

	let { message }: { message: ChatMessage } = $props();

	// An OOC/stage-direction note (*…*) renders italic + muted to read as
	// meta, not dialogue — the same distinction the backend draws.
	const isOoc = $derived(
		message.content.length > 2 &&
			message.content.startsWith('*') &&
			message.content.endsWith('*')
	);
	const segments = $derived(parseMessage(message.content));
</script>

<div class="user-bubble" class:user-bubble--ooc={isOoc}>
	{#each segments as seg, i (i)}
		<span
			class="user-bubble__seg"
			class:user-bubble__seg--dialogue={seg.type === 'dialogue'}
		>{seg.text}</span>
	{/each}
</div>

<style>
	.user-bubble {
		align-self: flex-end;
		max-width: 72%;
		background: var(--user-bg);
		border: 1px solid var(--user-border);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
		color: var(--user-text);
		font-size: var(--font-size-base);
		line-height: 1.55;
	}
	.user-bubble--ooc {
		color: var(--text-muted);
		font-style: italic;
		background: var(--user-bg);
		border-color: var(--user-border);
	}
	.user-bubble__seg {
		font-style: italic;
	}
	.user-bubble__seg--dialogue {
		font-style: normal;
		font-weight: 600;
	}
</style>
