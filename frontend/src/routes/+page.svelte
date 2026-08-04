<script lang="ts">
	import CharacterGrid from '$lib/components/chat/CharacterGrid.svelte';
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import ChatTopBar from '$lib/components/chat/ChatTopBar.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import { chat, sendMessage } from '$lib/state/chat.svelte';

	function handleSend(text: string): void {
		void sendMessage(text);
	}
</script>

{#if chat.nav === 'character' && !chat.activeSessionId}
	<CharacterGrid />
{:else}
	<div class="chat">
		<ChatTopBar />
		<MessageList />
		<div class="chat__composer">
			<ChatInput onSend={handleSend} disabled={chat.sending} />
		</div>
	</div>
{/if}

<style>
	.chat {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.chat__composer {
		padding: var(--space-3) var(--space-6) var(--space-4);
		border-top: 1px solid var(--border);
		background: var(--bg);
	}
</style>
