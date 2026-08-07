<script lang="ts">
	import {
		chat,
		loadPersonas,
		openPersonaInfoModal,
		openPersonaFormModal,
	} from '$lib/state/chat.svelte';
	import type { ApiPersona } from '$lib/api/chat';
	import { resolveFileUrl } from '$lib/api/chat';

	let loading = $state(false);

	function handleCardClick(persona: ApiPersona): void {
		openPersonaInfoModal(persona);
	}

	function getInitials(name: string): string {
		return name.slice(0, 2).toUpperCase();
	}

	function getAvatarUrl(persona: ApiPersona): string | null {
		return resolveFileUrl(persona.avatar ?? persona.avatar_file);
	}

	async function handleRetry(): Promise<void> {
		loading = true;
		await loadPersonas();
		loading = false;
	}
</script>

<div class="personas-grid">
	<!-- Header bar -->
	<div class="personas-header">
		<h1 class="personas-header__title">Personas</h1>
		<div class="personas-header__actions">
			<button class="action-btn" onclick={() => openPersonaFormModal('create')}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				<span>New</span>
			</button>
		</div>
	</div>

	<!-- Card grid -->
	{#if chat.personas.length === 0}
		<div class="empty-state">
			{#if chat.personasError}
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<p class="empty-state__title">Couldn't load personas</p>
				<p class="empty-state__hint">{chat.personasError}</p>
				<button class="retry-btn" onclick={handleRetry} disabled={loading}>
					{loading ? 'Retrying…' : 'Retry'}
				</button>
			{:else}
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
					<circle cx="12" cy="7" r="4" />
				</svg>
				<p class="empty-state__title">No personas yet</p>
				<p class="empty-state__hint">Create a new persona to get started.</p>
			{/if}
		</div>
	{:else}
		<div class="card-grid">
			{#each chat.personas as persona (persona.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="card" onclick={() => handleCardClick(persona)}>
					<div class="card__image">
						{#if getAvatarUrl(persona)}
							<img src={getAvatarUrl(persona)} alt={persona.name} />
						{:else}
							<span class="card__initials">{getInitials(persona.name)}</span>
						{/if}
					</div>
					<div class="card__info">
						<span class="card__name">{persona.name}</span>
						{#if persona.pronouns}
							<span class="card__tagline">{persona.pronouns}</span>
						{:else if persona.description}
							<span class="card__tagline">{persona.description}</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.personas-grid {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: var(--space-5);
		overflow-y: auto;
	}

	/* ── Header ──────────────────────────────────────────────────────── */
	.personas-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-5);
	}

	.personas-header__title {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-bold);
		color: var(--text);
	}

	.personas-header__actions {
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
