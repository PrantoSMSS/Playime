<script lang="ts">
	import CharacterGrid from '$lib/components/chat/CharacterGrid.svelte';
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import ChatTopBar from '$lib/components/chat/ChatTopBar.svelte';
	import ChatsList from '$lib/components/chat/ChatsList.svelte';
	import Home from '$lib/components/chat/Home.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import Personas from '$lib/components/chat/Personas.svelte';
	import { chat, sendMessage } from '$lib/state/chat.svelte';
	import { nav } from '$lib/state/nav.svelte';

	function handleSend(text: string): void {
		void sendMessage(text);
	}
</script>

{#if nav.activeView === 'conversation'}
	<div class="chat">
		<ChatTopBar />
		<MessageList />
		<div class="chat__composer">
			<ChatInput onSend={handleSend} disabled={chat.sending} />
		</div>
	</div>
{:else if nav.activeView === 'home'}
	<Home />
{:else if nav.activeView === 'character'}
	<CharacterGrid />
{:else if nav.activeView === 'chats'}
	<ChatsList />
{:else if nav.activeView === 'my-titles'}
	<Personas />
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
