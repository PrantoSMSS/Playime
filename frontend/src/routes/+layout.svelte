<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import CardInfoModal from '$lib/components/chat/CardInfoModal.svelte';
	import NavRail from '$lib/components/chat/NavRail.svelte';
	import { chat, closeCardInfoModal, startNewPlay } from '$lib/state/chat.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Playime</title>
</svelte:head>

<div class="app">
	<NavRail />
	<main class="app__main">
		{@render children()}
	</main>
</div>

{#if chat.cardInfoModal}
	<CardInfoModal
		card={chat.cardInfoModal.card}
		onclose={closeCardInfoModal}
		onstartplay={startNewPlay}
	/>
{/if}

<style>
	.app {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: var(--bg);
	}
	.app__main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
