<script lang="ts">
	import { activeMessages, activeSession, chat } from '$lib/state/chat.svelte';
	import MessageBubble from './MessageBubble.svelte';
	import UserMessageBubble from './UserMessageBubble.svelte';

	const messages = $derived(activeMessages());
	const session = $derived(activeSession());

	let listEl = $state<HTMLDivElement | undefined>();

	// Follow the conversation: scroll to the newest message whenever the
	// active thread changes, a message is added, or a reply is pending.
	$effect(() => {
		listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
	});
</script>

<div class="message-list" bind:this={listEl}>
	{#if messages.length === 0}
		<div class="message-list__empty">
			<p>Start the conversation with {session?.title ?? 'them'}.</p>
			<span>A quiet beginning is still a beginning.</span>
		</div>
	{/if}

	{#each messages as msg (msg.id)}
		{#if msg.role === 'assistant'}
			<MessageBubble
				message={msg}
				name={session?.title ?? ''}
				initials={session?.initials ?? '?'}
				hue={session?.hue ?? 170}
			/>
		{:else}
			<UserMessageBubble message={msg} />
		{/if}
	{/each}

	{#if chat.sending}
		<div class="pending" aria-live="polite" aria-label="Waiting for reply">
			<MessageBubble
				message={{ id: '__pending__', role: 'assistant', content: '', createdAt: Date.now() }}
				name={session?.title ?? ''}
				initials={session?.initials ?? '?'}
				hue={session?.hue ?? 170}
			>
				<span class="pending__dots" aria-hidden="true"><span></span><span></span><span></span></span>
			</MessageBubble>
		</div>
	{/if}

	{#if chat.error}
		<div class="error" role="alert">{chat.error}</div>
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-6) var(--space-8) var(--space-6);
	}

	.message-list__empty {
		margin: auto;
		text-align: center;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.message-list__empty p {
		margin: 0;
		font-size: var(--font-size-md);
		color: var(--text-secondary);
	}
	.message-list__empty span {
		font-size: var(--font-size-sm);
	}

	/* ---- Pending "…is writing" bubble ---- */
	.pending :global(.bubble__box) {
		display: flex;
		align-items: center;
	}
	.pending__dots {
		display: inline-flex;
		gap: 5px;
		align-items: center;
	}
	.pending__dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ai-narration);
		animation: pending-blink 1.2s ease-in-out infinite;
	}
	.pending__dots span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.pending__dots span:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes pending-blink {
		0%,
		60%,
		100% {
			opacity: 0.25;
		}
		30% {
			opacity: 1;
		}
	}

	/* ---- Send-failure notice ---- */
	.error {
		margin: auto;
		text-align: center;
		color: var(--text-secondary);
		background: var(--accent-soft);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4);
		font-size: var(--font-size-sm);
	}
</style>
