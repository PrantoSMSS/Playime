<script lang="ts">
	import { activeMessages, activeSession } from '$lib/state/chat.svelte';
	import MessageBubble from './MessageBubble.svelte';
	import UserMessageBubble from './UserMessageBubble.svelte';

	const messages = $derived(activeMessages());
	const session = $derived(activeSession());

	let listEl = $state<HTMLDivElement | undefined>();

	// Follow the conversation: scroll to the newest message whenever the
	// active thread changes or a message is added.
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
</style>
