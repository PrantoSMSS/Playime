<script lang="ts">
	import { chat, activeSession, toggleFavorite } from '$lib/state/chat.svelte';
	import { nav } from '$lib/state/nav.svelte';
	import { resolveFileUrl } from '$lib/api/chat';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	type FilterId = 'all' | 'recent' | 'favorites';
	let activeFilter = $state<FilterId>('all');

	const FILTERS: { id: FilterId; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'recent', label: 'Recent' },
		{ id: 'favorites', label: 'Favorites' },
	];

	/** Most recent session for the banner. */
	const mostRecent = $derived(
		chat.sessions.length > 0
			? [...chat.sessions].sort((a, b) => b.createdAt - a.createdAt)[0]
			: null
	);

	/** Filtered sessions for the card rows. */
	const filteredSessions = $derived.by(() => {
		const sorted = [...chat.sessions].sort((a, b) => b.createdAt - a.createdAt);
		switch (activeFilter) {
			case 'recent':
				return sorted.slice(0, 10);
			case 'favorites':
				return sorted.filter((s) => s.favorite);
			default:
				return sorted;
		}
	});

	/** Character sessions (library). */
	const characterSessions = $derived(
		filteredSessions.filter((s) => s.kind === 'character')
	);

	/** Story sessions. */
	const storySessions = $derived(
		filteredSessions.filter((s) => s.kind === 'story')
	);

	/** Navigate into a session conversation. */
	function openSession(sessionId: string): void {
		chat.activeSessionId = sessionId;
		nav.activeView = 'conversation';
	}

	/** Format a timestamp as relative time ("2m ago", "1h ago", etc.). */
	function timeAgo(ts: number): string {
		const diff = Date.now() - ts;
		const minutes = Math.floor(diff / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	/** Get avatar URL for a session, falling back to initials. */
	function sessionAvatar(session: { avatarUrl?: string; initials: string; hue: number }) {
		return resolveFileUrl(session.avatarUrl) ?? undefined;
	}
</script>

<div class="home">
	<!-- Banner: Continue where you left off -->
	{#if mostRecent}
		<div class="home__banner">
			<div class="home__banner-content">
				<p class="home__banner-label">
					<Icon name="clock" size={14} />
					Continue where you left off
				</p>
				<h2 class="home__banner-title">{mostRecent.title}</h2>
				<p class="home__banner-preview">{mostRecent.preview || 'No messages yet'}</p>
				<button class="home__banner-cta" onclick={() => openSession(mostRecent.id)}>
					Resume
				</button>
			</div>
			{#if mostRecent.avatarUrl}
				<div class="home__banner-art">
					<img src={sessionAvatar(mostRecent)} alt="" />
				</div>
			{/if}
		</div>
	{/if}

	<!-- Filter pills -->
	<div class="home__filters">
		{#each FILTERS as filter (filter.id)}
			<button
				class="home__filter"
				class:home__filter--active={activeFilter === filter.id}
				onclick={() => (activeFilter = filter.id)}
			>
				{filter.label}
			</button>
		{/each}
	</div>

	<!-- Your library (character sessions) -->
	{#if characterSessions.length > 0}
		<section class="home__section">
			<h3 class="home__section-title">Your library</h3>
			<div class="home__card-row">
				{#each characterSessions as session (session.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="home__card" onclick={() => openSession(session.id)}>
						<div class="home__card-art">
							{#if session.avatarUrl}
								<img src={sessionAvatar(session)} alt="" />
							{:else}
								<Avatar initials={session.initials} hue={session.hue} size={48} />
							{/if}
							<button
								class="home__fav"
								class:home__fav--active={!!session.favorite}
								onclick={(e) => { e.stopPropagation(); toggleFavorite(session.id); }}
								title={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
							>
								<Icon name={session.favorite ? 'heart-filled' : 'heart'} size={14} />
							</button>
						</div>
						<div class="home__card-info">
							<span class="home__card-name">{session.title}</span>
							<span class="home__card-meta">
								<Icon name="clock" size={11} />
								{timeAgo(session.createdAt)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:else if activeFilter === 'all' || activeFilter === 'favorites'}
		<section class="home__section">
			<h3 class="home__section-title">Your library</h3>
			<p class="home__empty">No characters yet. Import or create a character card to get started.</p>
		</section>
	{/if}

	<!-- Your stories -->
	{#if storySessions.length > 0}
		<section class="home__section">
			<h3 class="home__section-title">Your stories</h3>
			<div class="home__card-row">
				{#each storySessions as session (session.id)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="home__card" onclick={() => openSession(session.id)}>
						<div class="home__card-art home__card-art--story">
							<Icon name="story" size={32} />
							<button
								class="home__fav"
								class:home__fav--active={!!session.favorite}
								onclick={(e) => { e.stopPropagation(); toggleFavorite(session.id); }}
								title={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
							>
								<Icon name={session.favorite ? 'heart-filled' : 'heart'} size={14} />
							</button>
						</div>
						<div class="home__card-info">
							<span class="home__card-name">{session.title}</span>
							<span class="home__card-meta">
								<Icon name="clock" size={11} />
								{timeAgo(session.createdAt)}
							</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:else if activeFilter === 'all' || activeFilter === 'favorites'}
		<section class="home__section">
			<h3 class="home__section-title">Your stories</h3>
			<p class="home__empty">No stories yet. Start a story session to see it here.</p>
		</section>
	{/if}
</div>

<style>
	.home {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	/* ---- Banner ---- */
	.home__banner {
		display: flex;
		align-items: stretch;
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		min-height: 140px;
	}
	.home__banner-content {
		flex: 1;
		padding: var(--space-5) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.home__banner-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.home__banner-title {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		margin: 0;
	}
	.home__banner-preview {
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 400px;
	}
	.home__banner-cta {
		align-self: flex-start;
		margin-top: auto;
		padding: var(--space-2) var(--space-4);
		background: var(--accent);
		color: var(--on-accent);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		transition: background var(--transition-fast);
	}
	.home__banner-cta:hover {
		background: var(--accent-hover);
	}
	.home__banner-art {
		width: 180px;
		flex-shrink: 0;
		overflow: hidden;
	}
	.home__banner-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* ---- Filter pills ---- */
	.home__filters {
		display: flex;
		gap: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 2px;
		align-self: flex-start;
	}
	.home__filter {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.home__filter:hover {
		color: var(--text);
	}
	.home__filter--active {
		background: var(--accent-muted);
		color: var(--text);
		font-weight: var(--font-weight-medium);
	}

	/* ---- Sections ---- */
	.home__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.home__section-title {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		margin: 0;
	}

	/* ---- Card row (horizontal scroll) ---- */
	.home__card-row {
		display: flex;
		gap: var(--space-3);
		flex-shrink: 0;
		overflow-x: auto;
		padding-bottom: var(--space-2);
		/* Fade right edge */
		mask-image: linear-gradient(to right, black 85%, transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
	}
	.home__card-row::-webkit-scrollbar {
		height: 6px;
	}
	.home__card-row::-webkit-scrollbar-track {
		background: transparent;
	}
	.home__card-row::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: var(--radius-pill);
	}
	.home__card-row:hover::-webkit-scrollbar-thumb {
		background: var(--accent-muted);
	}

	/* ---- Single card ---- */
	.home__card {
		display: flex;
		flex-direction: column;
		width: 140px;
		flex-shrink: 0;
		border-radius: var(--radius-md);
		background: var(--surface);
		border: 1px solid var(--border-subtle);
		overflow: hidden;
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast);
		text-align: left;
	}
	.home__card:hover {
		border-color: var(--border);
		background: var(--bg-raised);
	}
	.home__card-art {
		position: relative;
		aspect-ratio: 1;
		background: var(--surface-elevated);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.home__card-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.home__card-art--story {
		color: var(--icon);
	}
	.home__card-info {
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 48px;
	}
	.home__card-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.home__card-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* ---- Favorite button ---- */
	.home__fav {
		position: absolute;
		top: var(--space-1);
		right: var(--space-1);
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-pill);
		background: rgba(0, 0, 0, 0.5);
		color: var(--text-muted);
		transition: color var(--transition-fast), background var(--transition-fast);
		opacity: 0;
	}
	.home__card:hover .home__fav,
	.home__fav--active {
		opacity: 1;
	}
	.home__fav:hover {
		background: rgba(0, 0, 0, 0.7);
		color: var(--text);
	}
	.home__fav--active {
		color: var(--favorite);
	}

	/* ---- Empty state ---- */
	.home__empty {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		margin: 0;
		padding: var(--space-4);
		text-align: center;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
	}
</style>
