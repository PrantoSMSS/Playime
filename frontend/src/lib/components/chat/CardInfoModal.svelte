<script lang="ts">
	import type { ApiAvatarOption, ApiCharacterCard, ApiStartingScenario } from '$lib/api/chat';
	import { parseMessage } from '$lib/messageParse';

	let {
		card,
		onclose,
		onstartplay,
	}: {
		card: ApiCharacterCard;
		onclose: () => void;
		onstartplay: ( selections: {
			avatarSelection?: string;
			startingScenarioId?: string;
		}) => void;
	} = $props();

	// Normalized avatars and scenarios (with defaults for legacy cards)
	const avatars: ApiAvatarOption[] = $derived(
		card.avatars.length > 0
			? card.avatars
			: card.avatar
				? [{ id: 'default', name: 'Default', image: card.avatar }]
				: []
	);

	const scenarios: ApiStartingScenario[] = $derived(
		card.starting_scenarios.length > 0
			? card.starting_scenarios
			: card.scenario || card.first_message
				? [{
						id: 'default',
						name: 'Default',
						scenario: card.scenario,
						first_message: card.first_message ?? '',
					}]
				: []
	);

	let selectedAvatarId = $state<string | null>(null);
	let selectedScenarioId = $state<string | null>(null);

	$effect(() => {
		if (avatars.length === 1 && selectedAvatarId === null) {
			selectedAvatarId = avatars[0]!.id;
		}
		if (scenarios.length === 1 && selectedScenarioId === null) {
			selectedScenarioId = scenarios[0]!.id;
		}
	});

	// The avatar image to show (selected one, or first, or card default)
	const displayImage = $derived(() => {
		if (selectedAvatarId) {
			const found = avatars.find((a) => a.id === selectedAvatarId);
			if (found) return found.image;
		}
		if (avatars.length > 0) return avatars[0]!.image;
		return card.avatar ?? card.cover_image ?? null;
	});

	// First message preview segments (parsed for narration/dialogue styling)
	const introSegments = $derived(() => {
		const msg = scenarios.length > 0 ? scenarios[0]!.first_message : card.first_message;
		if (!msg) return [];
		return parseMessage(msg);
	});

	function handleStartPlay(): void {
		onstartplay({
			avatarSelection: selectedAvatarId ?? undefined,
			startingScenarioId: selectedScenarioId ?? undefined,
		});
	}

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
	<div class="modal" role="dialog" aria-labelledby="card-info-title">
		<div class="modal__header">
			<h2 id="card-info-title" class="modal__header-title">Character Information</h2>
			<button class="modal__close" onclick={onclose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="modal__body">
			<!-- Top section: image left, info right -->
			<div class="modal__top">
				{#if displayImage()}
					<div class="modal__image">
						<img src={displayImage()!} alt={card.name} />
					</div>
				{/if}

				<div class="modal__info">
					<div class="modal__name-row">
						<h3 class="modal__name">{card.name}</h3>
					</div>

					{#if card.creator_name}
						<p class="modal__creator">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
							{card.creator_name}
						</p>
					{/if}

					{#if card.tags.length > 0}
						<div class="modal__tags">
							{#each card.tags as tag}
								<span class="modal__tag">{tag}</span>
							{/each}
						</div>
					{/if}

					{#if card.tagline}
						<p class="modal__tagline">{card.tagline}</p>
					{/if}

					<!-- Hashtag-style tags -->
					{#if card.tags.length > 0}
						<p class="modal__hashtags">
							{#each card.tags as tag, i}{#if i > 0} {/if}#{tag}{/each}
						</p>
					{/if}

					<!-- Stats -->
					<div class="modal__stats">
						<span class="modal__stat">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
							{card.stats.replay_count.toLocaleString()}
						</span>
						<span class="modal__stat">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-6 0v1H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-5z"/></svg>
							{card.stats.like_count.toLocaleString()}
						</span>
						<span class="modal__stat">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
							{card.stats.comment_count.toLocaleString()}
						</span>
					</div>
				</div>
			</div>

			<!-- Detailed Description -->
			{#if card.description}
				<div class="modal__section">
					<h3 class="modal__section-title">Detailed Description</h3>
					<p class="modal__section-text">{card.description}</p>
				</div>
			{/if}

			<!-- Settings: Avatar selector (only when multiple) -->
			{#if avatars.length > 1}
				<div class="modal__section">
					<h3 class="modal__section-title">Settings</h3>
					<p class="modal__section-subtitle">Avatar Settings</p>
					<div class="modal__dropdown">
						<select
							class="modal__select"
							value={selectedAvatarId ?? avatars[0]!.id}
							onchange={(e) => {
								const val = (e.target as HTMLSelectElement).value;
								selectedAvatarId = val;
							}}
						>
							{#each avatars as avatar}
								<option value={avatar.id}>{avatar.name ?? 'Avatar'}</option>
							{/each}
						</select>
						<svg class="modal__select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
					</div>
				</div>
			{/if}

			<!-- Intro Preview -->
			{#if introSegments().length > 0}
				<div class="modal__section">
					<h3 class="modal__section-title">Intro Preview</h3>
					<p class="modal__section-subtitle">{card.name}</p>
					<div class="modal__intro">
						{#each introSegments() as seg, i (i)}
							<span
								class="modal__intro-seg"
								class:modal__intro-seg--dialogue={seg.type === 'dialogue'}
							>{seg.text}</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Scenario picker (only when multiple) -->
			{#if scenarios.length > 1}
				<div class="modal__section">
					<h3 class="modal__section-title">Starting Scenario</h3>
					<div class="modal__scenarios">
						{#each scenarios as scenario}
							<button
								class="modal__scenario-btn"
								class:modal__scenario-btn--selected={selectedScenarioId === scenario.id}
								onclick={() => (selectedScenarioId = scenario.id)}
							>
								<span class="modal__scenario-name">{scenario.name}</span>
								{#if scenario.description}
									<span class="modal__scenario-desc">{scenario.description}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Sticky footer -->
		<div class="modal__footer">
			<button
				class="modal__start-btn"
				disabled={selectedScenarioId === null}
				onclick={handleStartPlay}
			>
				New Play
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--space-4);
	}

	.modal {
		position: relative;
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
		max-width: 560px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}

	/* Header */
	.modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	.modal__header-title {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__close {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--bg-raised);
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.modal__close:hover {
		background: var(--accent-soft);
		color: var(--icon-hover);
	}

	/* Body */
	.modal__body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
	}

	/* Top: image left, info right */
	.modal__top {
		display: flex;
		gap: var(--space-4);
	}

	.modal__image {
		flex-shrink: 0;
		width: 160px;
		height: 160px;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border);
	}
	.modal__image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.modal__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.modal__name-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.modal__name {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__creator {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.modal__tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.modal__tag {
		padding: 2px var(--space-2);
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
	}

	.modal__tagline {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
	}

	.modal__hashtags {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		line-height: 1.5;
	}

	.modal__stats {
		display: flex;
		gap: var(--space-4);
	}

	.modal__stat {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* Sections */
	.modal__section {
		margin-top: var(--space-5);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}

	.modal__section-title {
		margin: 0 0 var(--space-2);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__section-subtitle {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.modal__section-text {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	/* Avatar dropdown */
	.modal__dropdown {
		position: relative;
	}

	.modal__select {
		width: 100%;
		padding: var(--space-3);
		padding-right: var(--space-8);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		appearance: none;
		cursor: pointer;
	}

	.modal__select-icon {
		position: absolute;
		right: var(--space-3);
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-muted);
		pointer-events: none;
	}

	/* Intro preview */
	.modal__intro {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		font-size: var(--font-size-sm);
		line-height: 1.6;
	}

	.modal__intro-seg {
		color: var(--ai-narration);
		font-style: italic;
	}
	.modal__intro-seg--dialogue {
		color: var(--ai-dialogue);
		font-style: normal;
		font-weight: var(--font-weight-semibold);
	}

	/* Scenario picker */
	.modal__scenarios {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.modal__scenario-btn {
		text-align: left;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: transparent;
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast);
	}
	.modal__scenario-btn:hover {
		background: var(--bg-raised);
	}
	.modal__scenario-btn--selected {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.modal__scenario-name {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__scenario-desc {
		display: block;
		margin-top: 2px;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* Footer */
	.modal__footer {
		padding: var(--space-3) var(--space-5);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
	}

	.modal__start-btn {
		padding: var(--space-2) var(--space-5);
		background: var(--accent);
		color: var(--bg);
		border: none;
		border-radius: var(--radius-pill);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: opacity var(--transition-fast), background var(--transition-fast);
	}
	.modal__start-btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.modal__start-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
