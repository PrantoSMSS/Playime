<script lang="ts">
	import type { ChatMessage } from '$lib/types/chat';

	let { message }: { message: ChatMessage } = $props();

	// An OOC/stage-direction note (*…*) renders italic + muted to read as
	// meta, not dialogue — the same distinction the backend draws. The
	// surrounding asterisks are stripped from view, matching how the
	// assistant renderer treats *…* (italic narration).
	const isOoc = $derived(
		message.content.length > 2 &&
			message.content.startsWith('*') &&
			message.content.endsWith('*')
	);
	const display = $derived(isOoc ? message.content.slice(1, -1) : message.content);
</script>

<div class="user-bubble" class:user-bubble--ooc={isOoc}>{display}</div>

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
		background: var(--bg-raised);
		border-color: var(--border);
	}
</style>
