<script lang="ts">
	import { createStoryFromDraft, closeStoryDraftModal } from '$lib/state/chat.svelte';
	import type { ApiExtractionDraft, ApiQuestEntry } from '$lib/api/chat';
	import { regenerateQuest } from '$lib/api/chat';
	import Modal from './Modal.svelte';

	let {
		draft: initialDraft,
		onclose,
	}: {
		draft: ApiExtractionDraft;
		onclose: () => void;
	} = $props();

	// ── Editable draft state (copy of the original) ───────────────────────
	let title = $state(initialDraft.title);
	let genre = $state(initialDraft.genre);
	let premise = $state(initialDraft.premise);
	let tone = $state(initialDraft.tone);
	let locations = $state<string[]>([...initialDraft.locations]);
	let npcs = $state([...initialDraft.npcs]);
	let questLog = $state<ApiQuestEntry[]>([...initialDraft.quest_log]);

	// ── UI state ──────────────────────────────────────────────────────────
	let saving = $state(false);
	let errorMessage = $state('');
	let editingQuestId = $state<string | null>(null);
	let editTitle = $state('');
	let editObjective = $state('');
	let regeneratingId = $state<string | null>(null);

	// ── Derived ───────────────────────────────────────────────────────────
	const canSave = $derived(title.trim().length > 0 && !saving);

	// ── Quest helpers ─────────────────────────────────────────────────────

	function startEditQuest(quest: ApiQuestEntry): void {
		editingQuestId = quest.id;
		editTitle = quest.title;
		editObjective = quest.objective;
	}

	function saveQuestEdit(questId: string): void {
		const q = questLog.find((x) => x.id === questId);
		if (q) {
			q.title = editTitle;
			q.objective = editObjective;
		}
		editingQuestId = null;
	}

	function cancelQuestEdit(): void {
		editingQuestId = null;
	}

	function deleteQuest(questId: string): void {
		questLog = questLog.filter((q) => q.id !== questId);
		// Reorder remaining quests
		questLog.forEach((q, i) => { q.order = i; });
	}

	function moveQuest(questId: string, direction: 'up' | 'down'): void {
		const idx = questLog.findIndex((q) => q.id === questId);
		if (idx < 0) return;
		const newIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (newIdx < 0 || newIdx >= questLog.length) return;
		// Swap
		const temp = questLog[idx]!;
		questLog[idx] = questLog[newIdx]!;
		questLog[newIdx] = temp;
		// Reorder
		questLog.forEach((q, i) => { q.order = i; });
	}

	async function handleRegenerate(questId: string): Promise<void> {
		regeneratingId = questId;
		try {
			const outline = {
				title,
				genre,
				premise,
				tone,
				locations: locations.map((l) => ({ name: l, description: '' })),
				beats: questLog.map((q) => ({ summary: q.objective, order: q.order })),
			};
			const cast = {
				npcs: npcs.map((n) => ({
					name: n.name,
					personality: n.description,
					speech_style: '',
					tagline: '',
				})),
			};
			const regenerated = await regenerateQuest(questId, questLog, outline, cast);
			const idx = questLog.findIndex((q) => q.id === questId);
			if (idx >= 0) {
				questLog[idx] = { ...regenerated, order: questLog[idx]!.order };
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Regeneration failed';
		} finally {
			regeneratingId = null;
		}
	}

	// ── NPC helpers ───────────────────────────────────────────────────────

	function addNpc(): void {
		npcs.push({
			id: `npc_${Date.now()}`,
			name: 'New Character',
			description: '',
			relationship_state: { affection: 0, trust: 0, flags: [] },
		});
	}

	function removeNpc(npcId: string): void {
		npcs = npcs.filter((n) => n.id !== npcId);
	}

	// ── Location helpers ──────────────────────────────────────────────────

	function addLocation(): void {
		locations.push('New Location');
	}

	function removeLocation(index: number): void {
		locations = locations.filter((_, i) => i !== index);
	}

	// ── Submit ────────────────────────────────────────────────────────────

	async function handleCreate(): Promise<void> {
		saving = true;
		errorMessage = '';
		try {
			await createStoryFromDraft({
				title,
				genre,
				premise,
				tone,
				locations,
				npcs,
				quest_log: questLog,
			});
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create story card';
		} finally {
			saving = false;
		}
	}
</script>

<Modal title="Review Story Draft" {onclose}>
	<div class="draft-review">
		<!-- Error banner -->
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

		<!-- Basic fields -->
		<div class="field">
			<label class="field__label" for="draft-title">Title <span class="field__required">*</span></label>
			<input id="draft-title" class="field__input" type="text" bind:value={title} />
		</div>

		<div class="field-row">
			<div class="field">
				<label class="field__label" for="draft-genre">Genre</label>
				<input id="draft-genre" class="field__input" type="text" bind:value={genre} />
			</div>
			<div class="field">
				<label class="field__label" for="draft-tone">Tone</label>
				<input id="draft-tone" class="field__input" type="text" bind:value={tone} />
			</div>
		</div>

		<div class="field">
			<label class="field__label" for="draft-premise">Premise</label>
			<textarea id="draft-premise" class="field__textarea" rows="3" bind:value={premise}></textarea>
		</div>

		<!-- Locations -->
		<div class="field">
			<label class="field__label">Locations</label>
			<div class="tag-list">
				{#each locations as loc, i}
					<div class="tag">
						<input class="tag__input" type="text" bind:value={locations[i]} />
						<button class="tag__remove" onclick={() => removeLocation(i)} aria-label="Remove location">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
				<button class="tag-add" onclick={addLocation}>+ Add</button>
			</div>
		</div>

		<!-- NPCs -->
		<div class="field">
			<label class="field__label">Characters ({npcs.length})</label>
			<div class="npc-list">
				{#each npcs as npc}
					<div class="npc-card">
						<div class="npc-card__header">
							<input class="npc-card__name" type="text" bind:value={npc.name} />
							<button class="npc-card__remove" onclick={() => removeNpc(npc.id)} aria-label="Remove character">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
						<textarea class="npc-card__desc" rows="2" placeholder="Description..." bind:value={npc.description}></textarea>
					</div>
				{/each}
				<button class="add-btn" onclick={addNpc}>+ Add Character</button>
			</div>
		</div>

		<!-- Quest chain -->
		<div class="field">
			<label class="field__label">Quest Chain ({questLog.length})</label>
			<div class="quest-list">
				{#each questLog as quest, i}
					<div
						class="quest-item"
						class:quest-item--ending={quest.is_ending}
						class:quest-item--editing={editingQuestId === quest.id}
					>
						<!-- Reorder buttons -->
						<div class="quest-item__order">
							<button
								class="quest-item__move"
								disabled={i === 0}
								onclick={() => moveQuest(quest.id, 'up')}
								aria-label="Move up"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 15l-6-6-6 6" />
								</svg>
							</button>
							<span class="quest-item__number">{i + 1}</span>
							<button
								class="quest-item__move"
								disabled={i === questLog.length - 1}
								onclick={() => moveQuest(quest.id, 'down')}
								aria-label="Move down"
							>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>
						</div>

						<!-- Quest content -->
						<div class="quest-item__content">
							<div class="quest-item__header">
								<!-- Origin badge -->
								{#if quest.is_ending}
									<span class="badge badge--projected badge--ending">Proposed ending</span>
								{:else if quest.origin === 'projected'}
									<span class="badge badge--projected">AI-projected</span>
								{:else}
									<span class="badge badge--source">Source</span>
								{/if}
								<span class="quest-item__status">{quest.status}</span>
							</div>

							{#if editingQuestId === quest.id}
								<!-- Edit mode -->
								<input class="quest-item__edit-title" type="text" bind:value={editTitle} placeholder="Quest title" />
								<textarea class="quest-item__edit-obj" rows="2" bind:value={editObjective} placeholder="Objective..."></textarea>
								<div class="quest-item__edit-actions">
									<button class="quest-btn quest-btn--save" onclick={() => saveQuestEdit(quest.id)}>Save</button>
									<button class="quest-btn quest-btn--cancel" onclick={cancelQuestEdit}>Cancel</button>
								</div>
							{:else}
								<!-- View mode -->
								<div class="quest-item__title">{quest.title}</div>
								<div class="quest-item__objective">{quest.objective}</div>
							{/if}
						</div>

						<!-- Actions -->
						{#if editingQuestId !== quest.id}
							<div class="quest-item__actions">
								<button
									class="quest-btn quest-btn--icon"
									onclick={() => startEditQuest(quest)}
									aria-label="Edit quest"
									title="Edit"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
										<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
									</svg>
								</button>
								<button
									class="quest-btn quest-btn--icon"
									disabled={regeneratingId === quest.id}
									onclick={() => handleRegenerate(quest.id)}
									aria-label="Regenerate quest"
									title="Regenerate"
								>
									{#if regeneratingId === quest.id}
										<span class="quest-btn__spinner"></span>
									{:else}
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M23 4v6h-6M1 20v-6h6" />
											<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
										</svg>
									{/if}
								</button>
								<button
									class="quest-btn quest-btn--icon quest-btn--danger"
									onclick={() => deleteQuest(quest.id)}
									aria-label="Delete quest"
									title="Delete"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
									</svg>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Ending note -->
		<div class="ending-note">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="16" x2="12" y2="12" />
				<line x1="12" y1="8" x2="12.01" y2="8" />
			</svg>
			<span>The <strong>Proposed ending</strong> is AI-generated and not binding — you can edit, regenerate, or remove it.</span>
		</div>
	</div>

	{#snippet footer()}
		<div class="modal__footer-buttons">
			<button class="modal__btn modal__btn--cancel" onclick={onclose} disabled={saving}>
				Cancel
			</button>
			<button class="modal__btn modal__btn--save" disabled={!canSave} onclick={handleCreate}>
				{saving ? 'Creating...' : 'Create Story Card'}
			</button>
		</div>
	{/snippet}
</Modal>

<style>
	.draft-review {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
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

	/* ── Form fields ───────────────────────────────────────────────────── */
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field__label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
	}

	.field__required {
		color: var(--accent);
	}

	.field__input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		outline: none;
		transition: border-color var(--transition-fast);
	}
	.field__input:focus {
		border-color: var(--accent);
	}

	.field__textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		line-height: 1.5;
		resize: vertical;
		outline: none;
		transition: border-color var(--transition-fast);
	}
	.field__textarea:focus {
		border-color: var(--accent);
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	/* ── Tags (locations) ──────────────────────────────────────────────── */
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.tag {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
	}

	.tag__input {
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--font-size-xs);
		width: 120px;
		outline: none;
	}

	.tag__remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 50%;
		transition: color var(--transition-fast);
	}
	.tag__remove:hover {
		color: var(--text);
	}

	.tag-add {
		padding: var(--space-1) var(--space-2);
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: border-color var(--transition-fast), color var(--transition-fast);
	}
	.tag-add:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* ── NPC list ──────────────────────────────────────────────────────── */
	.npc-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.npc-card {
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.npc-card__header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.npc-card__name {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		outline: none;
	}

	.npc-card__remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 50%;
		transition: color var(--transition-fast);
	}
	.npc-card__remove:hover {
		color: var(--text);
	}

	.npc-card__desc {
		width: 100%;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: var(--font-size-xs);
		line-height: 1.4;
		resize: none;
		outline: none;
	}

	.add-btn {
		padding: var(--space-2);
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: border-color var(--transition-fast), color var(--transition-fast);
	}
	.add-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* ── Quest chain ───────────────────────────────────────────────────── */
	.quest-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.quest-item {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		align-items: flex-start;
		transition: border-color var(--transition-fast);
	}
	.quest-item--ending {
		border-color: var(--accent-muted);
		border-style: dashed;
	}
	.quest-item--editing {
		border-color: var(--accent);
	}

	.quest-item__order {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.quest-item__move {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 16px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 3px;
		transition: color var(--transition-fast), background var(--transition-fast);
	}
	.quest-item__move:hover:not(:disabled) {
		color: var(--text);
		background: var(--bg-hover);
	}
	.quest-item__move:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.quest-item__number {
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		color: var(--text-muted);
		min-width: 16px;
		text-align: center;
	}

	.quest-item__content {
		flex: 1;
		min-width: 0;
	}

	.quest-item__header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}

	.quest-item__status {
		font-size: 10px;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.quest-item__title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		margin-bottom: 2px;
	}

	.quest-item__objective {
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		line-height: 1.4;
	}

	/* Edit mode inputs */
	.quest-item__edit-title {
		width: 100%;
		padding: var(--space-1) var(--space-2);
		background: var(--surface-elevated);
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		outline: none;
		margin-bottom: var(--space-1);
	}

	.quest-item__edit-obj {
		width: 100%;
		padding: var(--space-1) var(--space-2);
		background: var(--surface-elevated);
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--font-size-xs);
		line-height: 1.4;
		resize: none;
		outline: none;
		margin-bottom: var(--space-1);
	}

	.quest-item__edit-actions {
		display: flex;
		gap: var(--space-2);
	}

	/* Quest actions */
	.quest-item__actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.quest-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast);
	}

	.quest-btn--icon {
		width: 24px;
		height: 24px;
		background: transparent;
		color: var(--text-muted);
	}
	.quest-btn--icon:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--text);
	}
	.quest-btn--icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.quest-btn--danger:hover:not(:disabled) {
		color: #ef4444;
	}

	.quest-btn--save {
		background: var(--accent);
		color: var(--on-accent);
	}
	.quest-btn--save:hover {
		background: var(--accent-hover);
	}

	.quest-btn--cancel {
		background: var(--bg-raised);
		color: var(--text-secondary);
	}
	.quest-btn--cancel:hover {
		background: var(--border);
	}

	.quest-btn__spinner {
		width: 12px;
		height: 12px;
		border: 1.5px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* ── Origin badges ─────────────────────────────────────────────────── */
	.badge {
		padding: 1px 6px;
		border-radius: var(--radius-pill);
		font-size: 10px;
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}

	.badge--source {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.badge--projected {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.badge--ending {
		background: rgba(168, 85, 247, 0.15);
		color: #a855f7;
	}

	/* ── Ending note ───────────────────────────────────────────────────── */
	.ending-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		line-height: 1.4;
	}
	.ending-note svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	.modal__footer-buttons {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	:global(.modal__btn) {
		padding: var(--space-2) var(--space-5);
		border: none;
		border-radius: var(--radius-pill);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: opacity var(--transition-fast), background var(--transition-fast);
	}

	:global(.modal__btn:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(.modal__btn--cancel) {
		background: var(--bg-raised);
		color: var(--text-secondary);
	}
	:global(.modal__btn--cancel:hover:not(:disabled)) {
		background: var(--border);
	}

	:global(.modal__btn--save) {
		background: var(--accent);
		color: var(--on-accent);
	}
	:global(.modal__btn--save:hover:not(:disabled)) {
		background: var(--accent-hover);
	}
</style>
