<script lang="ts">
	import CharacterGrid from '$lib/components/chat/CharacterGrid.svelte';
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import ChatTopBar from '$lib/components/chat/ChatTopBar.svelte';
	import HistoryList from '$lib/components/chat/HistoryList.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import { chat, sendMessage } from '$lib/state/chat.svelte';

	function handleSend(text: string): void {
		void sendMessage(text);
	}
</script>

{#if chat.activeSessionId}
	<div class="chat">
		<ChatTopBar />
		<MessageList />
		<div class="chat__composer">
			<ChatInput onSend={handleSend} disabled={chat.sending} />
		</div>
	</div>
{:else if chat.nav === 'character'}
	<CharacterGrid />
{:else if chat.nav === 'history'}
	<HistoryList />
{:else}
	<div class="placeholder">
		<p>Coming soon</p>
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

	.placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: var(--font-size-lg);
	}
</style>
