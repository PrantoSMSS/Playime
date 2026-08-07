<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import CardInfoModal from '$lib/components/chat/CardInfoModal.svelte';
	import CharacterFormModal from '$lib/components/chat/CharacterFormModal.svelte';
	import ImportCardModal from '$lib/components/chat/ImportCardModal.svelte';
	import NavRail from '$lib/components/chat/NavRail.svelte';
	import PersonaInfoModal from '$lib/components/chat/PersonaInfoModal.svelte';
	import PersonaFormModal from '$lib/components/chat/PersonaFormModal.svelte';
	import StoryImportModal from '$lib/components/chat/StoryImportModal.svelte';
	import StoryDraftReview from '$lib/components/chat/StoryDraftReview.svelte';
	import {
		chat, closeCardInfoModal, startNewPlay, openEditCardModal,
		closeCharacterFormModal, closeImportCardModal, loadCards, loadSessions, loadPersonas,
		closePersonaInfoModal, closePersonaFormModal,
		closeStoryImportModal, closeStoryDraftModal,
	} from '$lib/state/chat.svelte';
	import type { ApiCharacterCard } from '$lib/api/chat';

	let { children } = $props();

	// Load cards, sessions, and personas on mount
	$effect(() => {
		void loadCards().then(() => loadSessions());
		void loadPersonas();
	});

	function handleCardSaved(_card: ApiCharacterCard): void {
		closeCharacterFormModal();
	}
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
		source={chat.cardInfoModal.source}
		onclose={closeCardInfoModal}
		onstartplay={startNewPlay}
		onedit={(card) => openEditCardModal(card)}
	/>
{/if}

{#if chat.characterFormModal}
	<CharacterFormModal
		mode={chat.characterFormModal.mode}
		card={chat.characterFormModal.card}
		importedData={chat.characterFormModal.importedData}
		onclose={closeCharacterFormModal}
		onsave={handleCardSaved}
	/>
{/if}

{#if chat.importCardModal}
	<ImportCardModal
		onclose={closeImportCardModal}
		onparsed={chat.importCardModal.onparsed}
	/>
{/if}

{#if chat.personaInfoModal}
	<PersonaInfoModal />
{/if}

{#if chat.personaFormModal}
	<PersonaFormModal />
{/if}

{#if chat.storyImportModal}
	<StoryImportModal onclose={closeStoryImportModal} />
{/if}

{#if chat.storyDraftModal}
	<StoryDraftReview draft={chat.storyDraftModal.draft} onclose={closeStoryDraftModal} />
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
