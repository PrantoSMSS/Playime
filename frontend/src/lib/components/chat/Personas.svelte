<script lang="ts">
	import {
		chat,
		loadPersonas,
		openPersonaInfoModal,
		openPersonaFormModal,
		togglePersonaSelection,
		selectAllPersonas,
		enterSelectionMode,
		exitSelectionMode,
		bulkDeletePersonas,
	} from '$lib/state/chat.svelte';
	import type { ApiPersona } from '$lib/api/chat';
	import { resolveFileUrl } from '$lib/api/chat';

	let loading = $state(false);

	const selectedCount = $derived.by(() => Object.keys(chat.selectedPersonaIds).length);
	const allVisibleSelected = $derived.by(() => {
		const selectable = chat.personas.filter((p) => !isDefaultPersona(p));
		return selectable.length > 0 && selectable.every((p) => chat.selectedPersonaIds[p.id]);
	});

	const DEFAULT_PERSONA_ID = 'myself';

	function isDefaultPersona(persona: ApiPersona): boolean {
		return persona.id === DEFAULT_PERSONA_ID;
	}

	function handleCardClick(persona: ApiPersona): void {
		if (chat.selectionMode) {
			if (isDefaultPersona(persona)) return; // default persona is non-selectable
			togglePersonaSelection(persona.id);
			return;
		}
		openPersonaInfoModal(persona);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && chat.selectionMode) {
			exitSelectionMode();
		}
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

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="personas-grid">
	<!-- Header bar -->
	<div class="personas-header">
		<h1 class="personas-header__title">
			{chat.selectionMode ? 'Select personas' : 'Personas'}
		</h1>
		<div class="personas-header__actions">
			{#if chat.selectionMode}
				<button class="select-all-btn" onclick={() => selectAllPersonas(chat.personas.filter((p) => !isDefaultPersona(p)).map((p) => p.id))}>
					{allVisibleSelected ? 'Deselect All' : 'Select All'}
				</button>
				{#if selectedCount > 0}
					<button class="action-btn action-btn--delete" onclick={bulkDeletePersonas}>
						Delete ({selectedCount})
					</button>
				{/if}
				<button class="action-btn action-btn--cancel" onclick={exitSelectionMode}>Cancel</button>
			{:else}
				<button class="action-btn" onclick={() => openPersonaFormModal('create')}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span>New</span>
				</button>
				<button class="action-btn" onclick={enterSelectionMode}>Select</button>
			{/if}
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
				<div
					class="card"
					class:card--selected={chat.selectedPersonaIds[persona.id]}
					class:card--default={isDefaultPersona(persona)}
					onclick={() => handleCardClick(persona)}
				>
					{#if chat.selectionMode && !isDefaultPersona(persona)}
						<div class="card__checkbox">
							<input
								type="checkbox"
								checked={!!chat.selectedPersonaIds[persona.id]}
								onclick={(e) => { e.stopPropagation(); togglePersonaSelection(persona.id); }}
								tabindex="-1"
							/>
						</div>
					{/if}
					{#if isDefaultPersona(persona)}
						<span class="card__badge">Default</span>
					{/if}
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
		align-items: center;
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

	.select-all-btn {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		padding: var(--space-2) var(--space-3);
	}
	.select-all-btn:hover {
		text-decoration: underline;
	}

	.action-btn--delete {
		background: var(--danger-bg, #3b1c1c);
		color: var(--danger-text, #f87171);
		border-color: transparent;
	}
	.action-btn--delete:hover {
		background: var(--danger-hover, #4c2020);
		color: var(--danger-text, #f87171);
	}

	.action-btn--cancel {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
	}
	.action-btn--cancel:hover {
		background: var(--accent-hover);
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
		position: relative;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow: hidden;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			background var(--transition-fast);
		text-align: left;
		padding: 0;
		font: inherit;
	}
	.card:hover {
		border-color: var(--accent);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}
	.card--selected {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.card--default {
		border-color: var(--accent-muted);
		background: var(--accent-soft);
	}
	.card--default:hover {
		border-color: var(--accent);
	}

	.card__checkbox {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 1;
		display: flex;
		align-items: center;
	}
	.card__checkbox input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.card__badge {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		z-index: 1;
		padding: 2px var(--space-2);
		background: var(--accent);
		color: var(--on-accent);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		line-height: 1.4;
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
