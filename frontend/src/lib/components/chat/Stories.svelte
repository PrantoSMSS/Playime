<script lang="ts">
	import { listStories, deleteStory, resolveFileUrl } from '$lib/api/chat';
	import type { ApiStoryCard } from '$lib/api/chat';
	import { openStoryImportModal } from '$lib/state/chat.svelte';

	let stories = $state<ApiStoryCard[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Load stories on mount
	$effect(() => {
		void loadStories();
	});

	async function loadStories(): Promise<void> {
		loading = true;
		error = null;
		try {
			stories = await listStories();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stories';
		} finally {
			loading = false;
		}
	}

	async function handleDelete(id: string): Promise<void> {
		try {
			await deleteStory(id);
			stories = stories.filter((s) => s.id !== id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete story';
		}
	}

	function getInitials(title: string): string {
		return title.slice(0, 2).toUpperCase();
	}
</script>

<div class="stories-page">
	<!-- Header bar -->
	<div class="grid-header">
		<h1 class="grid-header__title">Stories</h1>
		<div class="grid-header__actions">
			<button class="action-btn action-btn--primary" onclick={openStoryImportModal}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				<span>Create Story</span>
			</button>
		</div>
	</div>

	<!-- Story list -->
	{#if loading}
		<div class="empty-state">
			<p>Loading stories...</p>
		</div>
	{:else if error}
		<div class="empty-state">
			<p class="empty-state__title">Couldn't load stories</p>
			<p class="empty-state__hint">{error}</p>
			<button class="retry-btn" onclick={loadStories}>Retry</button>
		</div>
	{:else if stories.length === 0}
		<div class="empty-state">
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
				<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
			</svg>
			<p class="empty-state__title">No stories yet</p>
			<p class="empty-state__hint">Create a story from source text to get started.</p>
			<button class="action-btn action-btn--primary" onclick={openStoryImportModal}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				<span>Create Story</span>
			</button>
		</div>
	{:else}
		<div class="story-grid">
			{#each stories as story (story.id)}
				<div class="story-card">
					<div class="story-card__image">
						<span class="story-card__initials">{getInitials(story.title)}</span>
					</div>
					<div class="story-card__info">
						<span class="story-card__title">{story.title}</span>
						{#if story.genre}
							<span class="story-card__genre">{story.genre}</span>
						{/if}
						{#if story.premise}
							<span class="story-card__premise">{story.premise}</span>
						{/if}
						<div class="story-card__meta">
							<span>{story.npcs.length} characters</span>
							<span>{story.quest_log.length} quests</span>
						</div>
					</div>
					<div class="story-card__actions">
						<button class="story-card__delete" onclick={() => handleDelete(story.id)} aria-label="Delete story">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.stories-page {
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

	.action-btn--primary {
		background: var(--accent);
		color: var(--on-accent);
		border-color: transparent;
	}
	.action-btn--primary:hover {
		background: var(--accent-hover);
		color: var(--on-accent);
		border-color: transparent;
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

	/* ── Story grid ──────────────────────────────────────────────────── */
	.story-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.story-card {
		position: relative;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow: hidden;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.story-card:hover {
		border-color: var(--accent);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.story-card__image {
		aspect-ratio: 16/9;
		background: linear-gradient(135deg, var(--accent-muted), var(--accent-soft));
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.story-card__initials {
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		color: var(--accent);
	}

	.story-card__info {
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.story-card__title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.story-card__genre {
		font-size: var(--font-size-xs);
		color: var(--accent);
		font-weight: var(--font-weight-medium);
	}

	.story-card__premise {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.4;
	}

	.story-card__meta {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-1);
		font-size: 10px;
		color: var(--text-muted);
	}

	.story-card__actions {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		opacity: 0;
		transition: opacity var(--transition-fast);
	}
	.story-card:hover .story-card__actions {
		opacity: 1;
	}

	.story-card__delete {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.story-card__delete:hover {
		background: rgba(239, 68, 68, 0.8);
	}
</style>
