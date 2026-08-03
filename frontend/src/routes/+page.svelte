<script lang="ts">
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import ChatTopBar from '$lib/components/chat/ChatTopBar.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import { addMessage } from '$lib/state/chat.svelte';

	function handleSend(text: string): void {
		addMessage(text, 'user');
	}
</script>

<div class="chat">
	<ChatTopBar />
	<MessageList />
	<div class="chat__composer">
		<ChatInput onSend={handleSend} />
	</div>
</div>

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
