<script lang="ts">
	import type { ApiCharacterCard, CreateCardInput, UpdateCardInput } from '$lib/api/chat';
	import { saveCard } from '$lib/state/chat.svelte';

	let {
		mode,
		card,
		importedData,
		onclose,
		onsave,
	}: {
		mode: 'create' | 'edit';
		card?: ApiCharacterCard;
		importedData?: Partial<CreateCardInput>;
		onclose: () => void;
		onsave: (card: ApiCharacterCard) => void;
	} = $props();

	// ── Tab state ─────────────────────────────────────────────────────────
	type Tab = 'identity' | 'personality' | 'scenario';
	let activeTab = $state<Tab>('identity');

	// ── Form fields (initialized from importedData, card, or empty) ────────
	// We intentionally capture the prop's initial value here — the modal is
	// created fresh per open, so reactivity is not needed.
	let name = $state(importedData?.name ?? card?.name ?? '');
	let tagline = $state(importedData?.tagline ?? card?.tagline ?? '');
	let description = $state(importedData?.description ?? card?.description ?? '');
	let personality = $state(importedData?.personality ?? card?.personality ?? '');
	let speechStyle = $state(importedData?.speech_style ?? card?.speech_style ?? '');
	let likesAndDislikes = $state(importedData?.likes_and_dislikes ?? card?.likes_and_dislikes ?? '');
	let scenario = $state(importedData?.scenario ?? card?.scenario ?? '');
	let firstMessage = $state(importedData?.first_message ?? card?.first_message ?? '');

	// ── Avatar ────────────────────────────────────────────────────────────
	let avatarPreview = $state<string | null>(importedData?.avatar ?? card?.avatar ?? null);
	let fileInput = $state<HTMLInputElement>();

	// ── Submission state ───────────────────────────────────────────────────
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);

	const canSave = $derived(name.trim().length > 0 && !saving);

	// ── Handlers ──────────────────────────────────────────────────────────
	function handleAvatarClick(): void {
		fileInput?.click();
	}

	function handleAvatarChange(e: Event): void {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			avatarPreview = reader.result as string;
		};
		reader.readAsDataURL(file);
		// Reset so the same file can be re-selected
		input.value = '';
	}

	function handleRemoveAvatar(): void {
		avatarPreview = null;
		if (fileInput) fileInput.value = '';
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}

	async function handleSave(): Promise<void> {
		if (!canSave) return;

		saving = true;
		errorMessage = null;

		try {
			let result: ApiCharacterCard | null;

			if (mode === 'create') {
				// Build base input from form fields
				const baseInput: CreateCardInput = {
					name: name.trim(),
					...(avatarPreview ? { avatar: avatarPreview } : {}),
					tagline: tagline.trim(),
					personality: personality.trim(),
					speech_style: speechStyle.trim(),
					likes_and_dislikes: likesAndDislikes.trim(),
					scenario: scenario.trim(),
					...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
					...(description.trim() ? { description: description.trim() } : {}),
				};

				// Merge with imported fields that aren't in the form
				const input: CreateCardInput = {
					...baseInput,
					// Pass through all imported fields that aren't form-editable
					...(importedData?.alternate_greetings ? { alternate_greetings: importedData.alternate_greetings } : {}),
					...(importedData?.world_info ? { world_info: importedData.world_info } : {}),
					...(importedData?.extensions ? { extensions: importedData.extensions } : {}),
					...(importedData?.tags ? { tags: importedData.tags } : {}),
					...(importedData?.creator ? { creator: importedData.creator } : {}),
					...(importedData?.creator_notes ? { creator_notes: importedData.creator_notes } : {}),
					...(importedData?.creator_name ? { creator_name: importedData.creator_name } : {}),
					...(importedData?.character_version ? { character_version: importedData.character_version } : {}),
					...(importedData?.system_prompt ? { system_prompt: importedData.system_prompt } : {}),
					...(importedData?.post_history_instructions ? { post_history_instructions: importedData.post_history_instructions } : {}),
					...(importedData?.mes_example ? { mes_example: importedData.mes_example } : {}),
					...(importedData?.starting_scenarios ? { starting_scenarios: importedData.starting_scenarios } : {}),
					...(importedData?.default_persona ? { default_persona: importedData.default_persona } : {}),
				};

				result = await saveCard('create', input);
			} else {
				const input: UpdateCardInput = {
					name: name.trim(),
					...(avatarPreview ? { avatar: avatarPreview } : {}),
					tagline: tagline.trim(),
					personality: personality.trim(),
					speech_style: speechStyle.trim(),
					likes_and_dislikes: likesAndDislikes.trim(),
					scenario: scenario.trim(),
					...(firstMessage.trim() ? { first_message: firstMessage.trim() } : {}),
					...(description.trim() ? { description: description.trim() } : {}),
				};
				result = await saveCard('edit', input, card?.id);
			}

			if (result) {
				onsave(result);
			} else {
				errorMessage = 'Failed to save. Please try again.';
			}
		} catch {
			errorMessage = 'An unexpected error occurred.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop">
	<div class="modal" role="dialog" aria-labelledby="character-form-title">
		<div class="modal__header">
			<h2 id="character-form-title" class="modal__header-title">
				{#if importedData}
					Create Character (Imported)
				{:else if mode === 'create'}
					Create Character
				{:else}
					Edit Character
				{/if}
			</h2>
			<button class="modal__close" onclick={onclose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Tabs -->
		<div class="modal__tabs">
			<button
				class="modal__tab"
				class:modal__tab--active={activeTab === 'identity'}
				onclick={() => (activeTab = 'identity')}
			>
				Identity
			</button>
			<button
				class="modal__tab"
				class:modal__tab--active={activeTab === 'personality'}
				onclick={() => (activeTab = 'personality')}
			>
				Personality
			</button>
			<button
				class="modal__tab"
				class:modal__tab--active={activeTab === 'scenario'}
				onclick={() => (activeTab = 'scenario')}
			>
				Scenario
			</button>
		</div>

		<div class="modal__body">
			{#if errorMessage}
				<div class="modal__error">{errorMessage}</div>
			{/if}

			{#if activeTab === 'identity'}
				<!-- Avatar picker -->
				<div class="modal__field">
					<label class="modal__label" for="char-avatar-upload">Avatar</label>
					<div class="modal__avatar-area">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="modal__avatar-picker"
							onclick={handleAvatarClick}
							role="button"
							tabindex="0"
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAvatarClick(); }}
						>
							{#if avatarPreview}
								<img src={avatarPreview} alt="Avatar preview" class="modal__avatar-img" />
								<div class="modal__avatar-overlay">
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
										<circle cx="12" cy="13" r="4"/>
									</svg>
								</div>
							{:else}
								<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
									<circle cx="12" cy="13" r="4"/>
								</svg>
								<span class="modal__avatar-text">Click to upload</span>
							{/if}
						</div>
						{#if avatarPreview}
							<button class="modal__avatar-remove" onclick={handleRemoveAvatar} aria-label="Remove avatar">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
					<input
						id="char-avatar-upload"
						bind:this={fileInput}
						type="file"
						accept="image/*"
						class="modal__file-input"
						onchange={handleAvatarChange}
					/>
				</div>

				<!-- Name -->
				<div class="modal__field">
					<label class="modal__label" for="char-name">Name <span class="modal__required">*</span></label>
					<input
						id="char-name"
						class="modal__input"
						type="text"
						placeholder="Character name"
						bind:value={name}
					/>
				</div>

				<!-- Tagline -->
				<div class="modal__field">
					<label class="modal__label" for="char-tagline">Tagline</label>
					<input
						id="char-tagline"
						class="modal__input"
						type="text"
						placeholder="Short description (shown in cards)"
						bind:value={tagline}
					/>
				</div>

				<!-- Description -->
				<div class="modal__field">
					<label class="modal__label" for="char-description">Description</label>
					<textarea
						id="char-description"
						class="modal__textarea"
						rows="3"
						placeholder="Detailed description of the character"
						bind:value={description}
					></textarea>
				</div>
			{/if}

			{#if activeTab === 'personality'}
				<div class="modal__field">
					<label class="modal__label" for="char-personality">Personality</label>
					<textarea
						id="char-personality"
						class="modal__textarea"
						rows="5"
						placeholder="Core personality traits, behaviors, and quirks"
						bind:value={personality}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="char-speech">Speech Style</label>
					<textarea
						id="char-speech"
						class="modal__textarea"
						rows="4"
						placeholder="How the character speaks (tone, vocabulary, patterns)"
						bind:value={speechStyle}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="char-likes">Likes & Dislikes</label>
					<textarea
						id="char-likes"
						class="modal__textarea"
						rows="4"
						placeholder="Preferences, interests, pet peeves"
						bind:value={likesAndDislikes}
					></textarea>
				</div>
			{/if}

			{#if activeTab === 'scenario'}
				<div class="modal__field">
					<label class="modal__label" for="char-scenario">Scenario</label>
					<textarea
						id="char-scenario"
						class="modal__textarea"
						rows="5"
						placeholder="Setting, context, and situation for the character"
						bind:value={scenario}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="char-first-msg">First Message</label>
					<textarea
						id="char-first-msg"
						class="modal__textarea"
						rows="6"
						placeholder="The character's opening message (shown as the first AI reply)"
						bind:value={firstMessage}
					></textarea>
				</div>
			{/if}
		</div>

		<div class="modal__footer">
			<button class="modal__btn modal__btn--cancel" onclick={onclose}>
				Cancel
			</button>
			<button
				class="modal__btn modal__btn--save"
				disabled={!canSave}
				onclick={handleSave}
			>
				{#if saving}
					Saving...
				{:else}
					Save
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	/* ── Backdrop ─────────────────────────────────────────────────────── */
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

	/* ── Header ───────────────────────────────────────────────────────── */
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

	/* ── Tabs ─────────────────────────────────────────────────────────── */
	.modal__tabs {
		display: flex;
		padding: 0 var(--space-5);
		border-bottom: 1px solid var(--border);
		gap: 0;
	}

	.modal__tab {
		flex: 1;
		padding: var(--space-3) var(--space-2);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
		text-align: center;
	}
	.modal__tab:hover {
		color: var(--text);
	}
	.modal__tab--active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	/* ── Body ─────────────────────────────────────────────────────────── */
	.modal__body {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* ── Error banner ─────────────────────────────────────────────────── */
	.modal__error {
		padding: var(--space-3);
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		text-align: center;
	}

	/* ── Form fields ──────────────────────────────────────────────────── */
	.modal__field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.modal__label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
	}

	.modal__required {
		color: var(--accent);
	}

	.modal__input {
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		font-family: inherit;
		outline: none;
		transition: border-color var(--transition-fast);
		box-sizing: border-box;
	}
	.modal__input:focus {
		border-color: var(--accent);
	}
	.modal__input::placeholder {
		color: var(--text-muted);
	}

	.modal__textarea {
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		font-family: inherit;
		outline: none;
		resize: vertical;
		min-height: 80px;
		transition: border-color var(--transition-fast);
		box-sizing: border-box;
	}
	.modal__textarea:focus {
		border-color: var(--accent);
	}
	.modal__textarea::placeholder {
		color: var(--text-muted);
	}

	/* ── Avatar picker ────────────────────────────────────────────────── */
	.modal__avatar-area {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.modal__avatar-picker {
		width: 120px;
		height: 120px;
		border: 2px dashed var(--border);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast);
		overflow: hidden;
		position: relative;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.modal__avatar-picker:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.modal__avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.modal__avatar-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity var(--transition-fast);
		color: white;
	}
	.modal__avatar-picker:hover .modal__avatar-overlay {
		opacity: 1;
	}

	.modal__avatar-text {
		font-size: var(--font-size-xs);
		text-align: center;
		line-height: 1.3;
	}

	.modal__avatar-remove {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--bg-raised);
		color: var(--text-muted);
		border: 1px solid var(--border);
		cursor: pointer;
		flex-shrink: 0;
		transition: color var(--transition-fast), background var(--transition-fast);
		margin-top: var(--space-2);
	}
	.modal__avatar-remove:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.modal__file-input {
		display: none;
	}

	/* ── Footer ───────────────────────────────────────────────────────── */
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
		transition: opacity var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
	}

	.modal__btn--cancel {
		background: var(--bg-raised);
		color: var(--text-secondary);
	}
	.modal__btn--cancel:hover {
		background: var(--border);
	}

	.modal__btn--save {
		background: var(--accent);
		color: var(--on-accent);
	}
	.modal__btn--save:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.modal__btn--save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
