<script lang="ts">
	import { activeMessages, activeSession, chat } from '$lib/state/chat.svelte';
	import MessageBubble from './MessageBubble.svelte';
	import UserMessageBubble from './UserMessageBubble.svelte';

	const messages = $derived(activeMessages());
	const session = $derived(activeSession());

	let listEl = $state<HTMLDivElement | undefined>();

	// Follow the conversation: scroll to the newest message whenever the active
	// thread changes, a message is added, or the live streaming reply grows.
	// Reading the last message's content (a deep-proxied $state element) makes
	// this re-run on every streaming delta, not just on message adds. While a
	// reply is streaming, jump instantly — smooth-scrolling every token would
	// lag behind the stream.
	$effect(() => {
		messages[messages.length - 1]?.content;
		listEl?.scrollTo({
			top: listEl.scrollHeight,
			behavior: chat.sending ? 'auto' : 'smooth'
		});
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
				avatarUrl={session?.avatarUrl}
			/>
		{:else}
			<UserMessageBubble message={msg} />
		{/if}
	{/each}

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
