<script lang="ts">
	import type { ApiCharacterCard, ApiStartingScenario, ApiPersona, ApiDefaultPersona } from '$lib/api/chat';
	import { parseMessage } from '$lib/messageParse';
	import { chat, removeCard, closeCardInfoModal, openEditCardModal } from '$lib/state/chat.svelte';
	import { exportCardAsJson, exportCardAsPng, resolveFileUrl } from '$lib/api/chat';
	import Modal from './Modal.svelte';
	import DeleteConfirmButton from './DeleteConfirmButton.svelte';

	let {
		card,
		source,
		onclose,
		onstartplay,
		onedit,
	}: {
		card: ApiCharacterCard;
		source?: 'card-browser' | 'conversation';
		onclose: () => void;
		onstartplay: ( selections: {
			personaId?: string;
			personaSource?: 'default' | 'custom';
			playerName?: string;
			startingScenarioId?: string;
		}) => void;
		onedit: (card: ApiCharacterCard) => void;
	} = $props();

	// ── Normalized scenarios ──────────────────────────────────────────────
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

	// ── Modal-local state ─────────────────────────────────────────────────
	let selectedScenarioId = $state<string | null>(null);
	let personaSelectValue = $state('myself');
	let playerName = $state('');
	let showPersonaInfo = $state(false);
	let showExportDropdown = $state(false);
	let isDeleting = $state(false);
	let isExporting = $state(false);
	let localError = $state<string | null>(null);

	// ── Derived values ────────────────────────────────────────────────────
	const selectedScenario = $derived(
		selectedScenarioId ? scenarios.find((s) => s.id === selectedScenarioId) : undefined
	);

	// Derived persona state from select value
	const selectedPersonaType = $derived<'default' | 'custom' | 'myself'>(
		personaSelectValue === 'default' ? 'default'
		: personaSelectValue.startsWith('custom:') ? 'custom'
		: 'myself'
	);
	const selectedCustomPersonaId = $derived<string | null>(
		personaSelectValue.startsWith('custom:') ? personaSelectValue.slice(7) : null
	);

	// Default persona belongs to the Character/Story, not the Scenario
	const hasDefaultPersona = $derived(
		!!card.default_persona
	);

	// The persona label shown in the dropdown for the card's default persona
	const defaultPersonaLabel = $derived(() => {
		const dp = card.default_persona;
		if (!dp) return 'Default Persona';
		const base = dp.label || 'Default Persona';
		return `${base} (Default)`;
	});

	// Description shown below the dropdown for the current selection
	const personaDescription = $derived(() => {
		if (personaSelectValue === 'myself') return 'Just be yourself';
		if (personaSelectValue === 'default') {
			const dp = card.default_persona;
			if (!dp) return '';
			return [dp.role, dp.background].filter(Boolean).join(' — ') || '';
		}
		if (personaSelectValue.startsWith('custom:')) {
			const id = personaSelectValue.slice(7);
			const p = chat.personas.find((x) => x.id === id);
			return p?.description || '';
		}
		return '';
	});

	function handlePersonaSelect(e: Event) {
		personaSelectValue = (e.target as HTMLSelectElement).value;
	}

	// Play button enabled state
	const canPlay = $derived(() => {
		if (!selectedScenarioId) return false;
		if (selectedPersonaType === 'default') {
			return playerName.trim().length > 0;
		}
		// custom or myself
		return true;
	});

	// First message preview segments
	const introSegments = $derived(() => {
		const msg = selectedScenario?.first_message ?? scenarios[0]?.first_message ?? card.first_message;
		if (!msg) return [];
		return parseMessage(msg);
	});

	// The avatar image to show — first from the avatars array, or card default
	const displayImage = $derived(() => {
		const raw = card.avatars.length > 0 ? card.avatars[0]!.image : (card.avatar ?? card.avatar_file ?? card.cover_file ?? card.cover_image ?? null);
		return resolveFileUrl(raw);
	});

	// ── Effects ───────────────────────────────────────────────────────────

	// Auto-select default persona when card has one
	$effect(() => {
		if (card.default_persona) {
			personaSelectValue = 'default';
		}
	});

	// Auto-select if only one scenario
	$effect(() => {
		if (scenarios.length === 1 && selectedScenarioId === null) {
			selectedScenarioId = scenarios[0]!.id;
		}
	});

	// ── Handlers ──────────────────────────────────────────────────────────

	function handleStartPlay(): void {
		if (!canPlay()) return;

		if (selectedPersonaType === 'default') {
			onstartplay({
				personaSource: 'default',
				playerName: playerName.trim(),
				startingScenarioId: selectedScenarioId ?? undefined,
			});
		} else if (selectedPersonaType === 'custom' && selectedCustomPersonaId) {
			onstartplay({
				personaId: selectedCustomPersonaId,
				personaSource: 'custom',
				startingScenarioId: selectedScenarioId ?? undefined,
			});
		} else {
			// "Myself" — no persona, no player name
			onstartplay({
				startingScenarioId: selectedScenarioId ?? undefined,
			});
		}
	}

	function handleClickOutside(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.closest('.modal__export-wrapper')) {
			showExportDropdown = false;
		}
	}

	async function handleDelete(): Promise<void> {
		isDeleting = true;
		localError = null;
		try {
			const success = await removeCard(card.id);
			if (success) {
				closeCardInfoModal();
			} else {
				localError = chat.cardsError ?? 'Failed to delete character.';
			}
		} catch (err) {
			localError = err instanceof Error ? err.message : 'Failed to delete character.';
		} finally {
			isDeleting = false;
		}
	}

	async function handleExport(format: 'json' | 'png'): Promise<void> {
		isExporting = true;
		showExportDropdown = false;
		localError = null;
		try {
			if (format === 'json') {
				await exportCardAsJson(card);
			} else {
				await exportCardAsPng(card);
			}
		} catch (err) {
			localError = err instanceof Error ? err.message : 'Failed to export card';
		} finally {
			isExporting = false;
		}
	}
</script>

<svelte:window onpointerdown={handleClickOutside} />

<Modal title="Character Information" {onclose} aria-labelledby="card-info-title">
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
					{#each card.tags as tag, i (tag)}{i > 0 ? ' ' : ''}#{tag}{/each}
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

	<!-- ═══ PERSONA PICKER (always visible, first) ═══ -->
	<div class="modal__section">
		<div class="modal__persona-header">
			<h3 class="modal__section-title">Your Persona</h3>
			<!-- Info button -->
			<button
				class="modal__info-btn"
				onclick={() => (showPersonaInfo = !showPersonaInfo)}
				aria-label="What is a Persona?"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/>
					<path d="M12 16v-4M12 8h.01"/>
				</svg>
			</button>
		</div>

		{#if showPersonaInfo}
			<div class="modal__info-tooltip">
				<p><strong>Persona is who you are in the story.</strong></p>
				<p>It can affect how characters treat you, what they call you, and how they react to your background.</p>
				<p><em>Example: a respected athlete might be treated with admiration, while someone with a feared reputation may be treated more cautiously.</em></p>
			</div>
		{/if}

		<div class="modal__personas">
			<select
				class="modal__persona-select"
				value={personaSelectValue}
				onchange={handlePersonaSelect}
			>
				<option value="myself">Myself</option>
				{#if hasDefaultPersona}
					<option value="default">{defaultPersonaLabel()}</option>
				{/if}
				{#each chat.personas as persona (persona.id)}
					<option value="custom:{persona.id}">
						{persona.name}{persona.description ? ` — ${persona.description}` : ''}
					</option>
				{/each}
			</select>

			{#if personaDescription()}
				<p class="modal__persona-selected-desc">{personaDescription()}</p>
			{/if}

			{#if selectedPersonaType === 'default' && hasDefaultPersona}
				<p class="modal__persona-recommend">✦ Recommended for the best roleplay experience</p>
			{/if}
		</div>
	</div>

	<!-- ═══ NAME FIELD (only when Default persona selected) ═══ -->
	{#if selectedPersonaType === 'default' && hasDefaultPersona}
		<div class="modal__section">
			<h3 class="modal__section-title">What will be your name?</h3>
			<input
				class="modal__name-input"
				type="text"
				placeholder="Enter your name..."
				bind:value={playerName}
			/>
		</div>
	{/if}

	<!-- ═══ SCENARIO PICKER (always visible) ═══ -->
	<div class="modal__section">
		<h3 class="modal__section-title">Starting Scenario</h3>
		<p class="modal__section-subtitle">What situation is being played?</p>
		{#if scenarios.length === 1}
			<!-- Single scenario: show name only -->
			<div class="modal__scenario-single">
				<span class="modal__scenario-name">{scenarios[0]!.name}</span>
				{#if scenarios[0]!.description}
					<span class="modal__scenario-desc">{scenarios[0]!.description}</span>
				{/if}
			</div>
		{:else}
			<!-- Multiple scenarios: selectable buttons -->
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
		{/if}
	</div>

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

	{#snippet footer()}
		{#if localError}
			<div class="modal__error">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="8" x2="12" y2="12"/>
					<line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
				{localError}
			</div>
		{/if}
		<div class="modal__footer-buttons">
			{#if source !== 'conversation'}
				<DeleteConfirmButton label="Delete this character?" onconfirm={handleDelete} disabled={isDeleting} />
			{/if}

			<div class="modal__footer-right">
				{#if source !== 'conversation'}
					<!-- Edit button -->
					<button
						class="modal__edit-btn"
						onclick={() => onedit(card)}
						aria-label="Edit character"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
						</svg>
						Edit
					</button>

					<!-- Export dropdown -->
					<div class="modal__export-wrapper">
						<button
							class="modal__export-btn"
							onclick={() => (showExportDropdown = !showExportDropdown)}
							disabled={isExporting}
							aria-label="Export character"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
							</svg>
							Export
						</button>
						{#if showExportDropdown}
							<div class="modal__export-dropdown">
								<button class="modal__export-option" onclick={() => handleExport('json')}>
									.json (without avatar)
								</button>
								<button class="modal__export-option" onclick={() => handleExport('png')}>
									.png (with avatar)
								</button>
							</div>
						{/if}
					</div>
				{/if}

				<!-- New Play button -->
				<button
					class="modal__start-btn"
					disabled={!canPlay()}
					onclick={handleStartPlay}
				>
					New Play
				</button>
			</div>
		</div>
	{/snippet}
</Modal>

<style>
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

	/* Scenario picker */
	.modal__scenario-single {
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

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

	/* Persona header with info button */
	.modal__persona-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.modal__persona-header .modal__section-title {
		margin: 0;
	}

	.modal__info-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: color var(--transition-fast), background var(--transition-fast);
		flex-shrink: 0;
	}
	.modal__info-btn:hover {
		color: var(--accent);
		background: var(--accent-soft);
	}

	/* Info tooltip */
	.modal__info-tooltip {
		padding: var(--space-3);
		margin-bottom: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.modal__info-tooltip p {
		margin: 0 0 var(--space-2);
	}
	.modal__info-tooltip p:last-child {
		margin-bottom: 0;
	}

	/* Persona picker */
	.modal__personas {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.modal__persona-select {
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		font-family: inherit;
		outline: none;
		cursor: pointer;
		transition: border-color var(--transition-fast);
		/* Custom dropdown arrow */
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239cb6b1' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right var(--space-3) center;
		padding-right: var(--space-8);
	}
	.modal__persona-select:focus {
		border-color: var(--accent);
	}
	.modal__persona-select option {
		background: var(--bg-raised);
		color: var(--text);
	}

	.modal__persona-selected-desc {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.modal__persona-recommend {
		margin: var(--space-1) 0 0;
		padding: 0 var(--space-3);
		font-size: var(--font-size-xs);
		color: var(--accent);
		font-style: italic;
	}

	/* Name input */
	.modal__name-input {
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		outline: none;
		transition: border-color var(--transition-fast);
	}
	.modal__name-input:focus {
		border-color: var(--accent);
	}
	.modal__name-input::placeholder {
		color: var(--text-muted);
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

	/* Footer */
	.modal__error {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-error-bg, rgba(239, 68, 68, 0.1));
		color: var(--color-error, #ef4444);
		border: 1px solid var(--color-error-border, rgba(239, 68, 68, 0.3));
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-2);
	}

	.modal__footer-buttons {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.modal__footer-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* Edit button */
	.modal__edit-btn {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
	}
	.modal__edit-btn:hover {
		color: var(--text);
		border-color: var(--text-muted);
		background: var(--bg-raised);
	}

	/* Export button */
	.modal__export-wrapper {
		position: relative;
	}

	.modal__export-btn {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
	}
	.modal__export-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-muted);
		background: var(--bg-raised);
	}
	.modal__export-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal__export-dropdown {
		position: absolute;
		bottom: calc(100% + var(--space-1));
		right: 0;
		min-width: 180px;
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
		z-index: 10;
		overflow: hidden;
	}

	.modal__export-option {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--text);
		border: none;
		text-align: left;
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.modal__export-option:hover {
		background: var(--bg-raised);
	}

	/* New Play button */
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
