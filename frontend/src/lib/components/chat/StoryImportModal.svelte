<script lang="ts">
	import { extractStory } from '$lib/api/chat';
	import type { ApiStageProgress, ApiExtractionDraft } from '$lib/api/chat';
	import { openStoryDraftModal, closeStoryImportModal } from '$lib/state/chat.svelte';

	let {
		onclose,
	}: {
		onclose: () => void;
	} = $props();

	// ── State ─────────────────────────────────────────────────────────────
	let sourceText = $state('');
	let extracting = $state(false);
	let errorMessage = $state('');
	let currentStage = $state<ApiStageProgress | null>(null);

	// ── Derived ───────────────────────────────────────────────────────────
	const canGenerate = $derived(sourceText.trim().length > 50 && !extracting);

	// ── Stage labels ──────────────────────────────────────────────────────
	const STAGE_LABELS: Record<string, { started: string; done: string }> = {
		outline: { started: 'Analyzing story structure...', done: 'Outline complete' },
		cast: { started: 'Identifying characters...', done: 'Cast identified' },
		quests: { started: 'Building quest chain...', done: 'Quest chain ready' },
	};

	const STAGE_ORDER = ['outline', 'cast', 'quests'];

	function stageIndex(stage: string): number {
		return STAGE_ORDER.indexOf(stage);
	}

	// ── Handlers ──────────────────────────────────────────────────────────

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && !extracting) onclose();
	}

	async function handleGenerate(): Promise<void> {
		if (!canGenerate) return;
		extracting = true;
		errorMessage = '';
		currentStage = null;

		try {
			const draft: ApiExtractionDraft = await extractStory(sourceText, (stage) => {
				currentStage = stage;
			});
			openStoryDraftModal(draft);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Extraction failed — is the server running?';
		} finally {
			extracting = false;
			currentStage = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop">
	<div class="modal" role="dialog" aria-labelledby="story-import-title">
		<div class="modal__header">
			<h2 id="story-import-title" class="modal__header-title">Import Story</h2>
			<button class="modal__close" onclick={onclose} aria-label="Close" disabled={extracting}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="modal__body">
			<p class="modal__description">
				Paste your story text below. AI will analyze it and create a structured story card
				with characters, quest chain, and world details.
			</p>

			<textarea
				class="story-textarea"
				placeholder="Paste your story here... (minimum ~50 characters)"
				spellcheck="false"
				bind:value={sourceText}
				disabled={extracting}
			></textarea>

			<!-- Stage progress indicator -->
			{#if extracting || currentStage}
				<div class="stage-progress">
					{#each STAGE_ORDER as stageKey, i}
						{@const label = STAGE_LABELS[stageKey]}
						{@const isActive = currentStage?.stage === stageKey && currentStage?.status === 'started'}
						{@const isDone = currentStage
							? stageIndex(currentStage.stage) > i ||
							  (currentStage.stage === stageKey && currentStage.status === 'done')
							: false}
						<div class="stage" class:stage--active={isActive} class:stage--done={isDone}>
							{#if isDone}
								<svg class="stage__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{:else if isActive}
								<span class="stage__spinner"></span>
							{:else}
								<span class="stage__pending">{i + 1}</span>
							{/if}
							<span class="stage__label">
								{isActive ? label.started : isDone ? label.done : label.started.replace('...', '')}
							</span>
						</div>
						{#if i < STAGE_ORDER.length - 1}
							<div class="stage__connector" class:stage__connector--done={isDone}></div>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Error message -->
			{#if errorMessage}
				<div class="error-banner">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					<span>{errorMessage}</span>
				</div>
			{/if}
		</div>

		<div class="modal__footer">
			<button class="modal__btn modal__btn--cancel" onclick={onclose} disabled={extracting}>
				Cancel
			</button>
			<button
				class="modal__btn modal__btn--generate"
				disabled={!canGenerate}
				onclick={handleGenerate}
			>
				{#if extracting}
					Extracting...
				{:else}
					✦ Generate Story Card
				{/if}
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
		max-width: 600px;
		width: 100%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
	}

	/* ── Header ────────────────────────────────────────────────────────── */
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
		color: var(--text-muted);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.modal__close:hover {
		background: var(--accent-soft);
		color: var(--text);
	}

	/* ── Body ──────────────────────────────────────────────────────────── */
	.modal__body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.modal__description {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.5;
	}

	/* ── Story textarea ────────────────────────────────────────────────── */
	.story-textarea {
		width: 100%;
		min-height: 200px;
		max-height: 400px;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-family: monospace;
		font-size: var(--font-size-sm);
		line-height: 1.6;
		resize: vertical;
		outline: none;
		transition: border-color var(--transition-fast);
	}
	.story-textarea:focus {
		border-color: var(--accent);
	}
	.story-textarea::placeholder {
		color: var(--text-muted);
	}

	/* ── Stage progress ────────────────────────────────────────────────── */
	.stage-progress {
		display: flex;
		align-items: center;
		gap: 0;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.stage {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}
	.stage--active {
		background: var(--accent-soft);
	}
	.stage--done {
		opacity: 0.7;
	}

	.stage__icon {
		color: var(--accent);
		flex-shrink: 0;
	}

	.stage__spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.stage__pending {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.stage__label {
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.stage__connector {
		width: 20px;
		height: 1px;
		background: var(--border);
		margin: 0 var(--space-1);
		flex-shrink: 0;
		transition: background var(--transition-fast);
	}
	.stage__connector--done {
		background: var(--accent);
	}

	/* ── Error banner ──────────────────────────────────────────────────── */
	.error-banner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}
	.error-banner svg {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--text-muted);
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	.modal__footer {
		padding: var(--space-3) var(--space-5);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.modal__btn {
		padding: var(--space-2) var(--space-5);
		border: none;
		border-radius: var(--radius-pill);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: opacity var(--transition-fast), background var(--transition-fast);
	}

	.modal__btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal__btn--cancel {
		background: var(--bg-raised);
		color: var(--text-secondary);
	}
	.modal__btn--cancel:hover:not(:disabled) {
		background: var(--border);
	}

	.modal__btn--generate {
		background: var(--accent);
		color: var(--on-accent);
	}
	.modal__btn--generate:hover:not(:disabled) {
		background: var(--accent-hover);
	}
</style>
