<script lang="ts">
	import {
		chat,
		loadCards,
		openCardInfoModal,
		openCreateCardModal,
		openImportCardModal,
		closeImportCardModal,
	} from '$lib/state/chat.svelte';
	import type { ApiCharacterCard, CreateCardInput } from '$lib/api/chat';
	import { resolveFileUrl } from '$lib/api/chat';

	let loading = $state(false);

	function handleCardClick(card: ApiCharacterCard): void {
		void openCardInfoModal(card.id);
	}

	function handleImportClick(): void {
		openImportCardModal((data: Partial<CreateCardInput>) => {
			closeImportCardModal();
			openCreateCardModal(data);
		});
	}

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	/** Resolve the display image for a card — first from avatars array, then legacy avatar, then file storage fields, then cover. */
	function getDisplayImage(card: ApiCharacterCard): string | null {
		const raw = card.avatars.length > 0 ? card.avatars[0]!.image : (card.avatar ?? card.avatar_file ?? card.cover_file ?? card.cover_image ?? null);
		return resolveFileUrl(raw);
	}

	async function handleRetry(): Promise<void> {
		loading = true;
		await loadCards();
		loading = false;
	}
</script>

<div class="character-grid">
	<!-- Header bar -->
	<div class="grid-header">
		<h1 class="grid-header__title">Character</h1>
		<div class="grid-header__actions">
			<button class="action-btn" onclick={() => openCreateCardModal()}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				<span>New</span>
			</button>
			<button class="action-btn" onclick={handleImportClick}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<span>Upload</span>
			</button>
		</div>
	</div>

	<!-- Card grid -->
	{#if chat.cards.length === 0}
		<div class="empty-state">
			{#if chat.error}
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<p class="empty-state__title">Couldn't load characters</p>
				<p class="empty-state__hint">{chat.error}</p>
				<button class="retry-btn" onclick={handleRetry} disabled={loading}>
					{loading ? 'Retrying…' : 'Retry'}
				</button>
			{:else}
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
					<line x1="12" y1="8" x2="12" y2="16" />
					<line x1="8" y1="12" x2="16" y2="12" />
				</svg>
				<p class="empty-state__title">No characters yet</p>
				<p class="empty-state__hint">Create a new character or import one to get started.</p>
			{/if}
		</div>
	{:else}
		<div class="card-grid">
			{#each chat.cards as card (card.id)}
				<button class="card" onclick={() => handleCardClick(card)}>
					<div class="card__image">
						{#if getDisplayImage(card)}
							<img src={getDisplayImage(card)} alt={card.name} />
						{:else}
							<span class="card__initials">{getInitials(card.name)}</span>
						{/if}
					</div>
					<div class="card__info">
						<span class="card__name">{card.name}</span>
						{#if card.tagline}
							<span class="card__tagline">{card.tagline}</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.character-grid {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: var(--space-5);
		overflow-y: auto;
	}

	/* ── Header ──────────────────────────────────────────────────────── */
	.grid-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-5);
	}

	.grid-header__title {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--text);
	}

	.grid-header__actions {
		display: flex;
		gap: var(--space-3);
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
	}
	.action-btn:hover {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}

	/* ── Empty state ─────────────────────────────────────────────────── */
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		color: var(--text-muted);
	}

	.empty-state__title {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
	}

	.empty-state__hint {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.retry-btn {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			color var(--transition-fast),
			border-color var(--transition-fast);
	}
	.retry-btn:hover:not(:disabled) {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}
	.retry-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Card grid ───────────────────────────────────────────────────── */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-4);
	}

	/* ── Card ────────────────────────────────────────────────────────── */
	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow: hidden;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
		text-align: left;
		padding: 0;
		font: inherit;
	}
	.card:hover {
		border-color: var(--accent);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.card__image {
		aspect-ratio: 1;
		background: var(--bg-raised);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.card__image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card__initials {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--text-muted);
	}

	.card__info {
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.card__name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card__tagline {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.4;
	}
</style>
