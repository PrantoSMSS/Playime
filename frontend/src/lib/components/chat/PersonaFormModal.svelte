<script lang="ts">
	import Modal from './Modal.svelte';
	import { chat, closePersonaFormModal, loadPersonas } from '$lib/state/chat.svelte';
	import {
		createPersona, updatePersona, uploadAvatar, resolveFileUrl,
	} from '$lib/api/chat';
	import type { CreatePersonaInput, UpdatePersonaInput } from '$lib/api/chat';

	let { mode, persona } = $derived(chat.personaFormModal!);

	// ── Form fields ────────────────────────────────────────────────────
	let name = $state(persona?.name ?? '');
	let description = $state(persona?.description ?? '');
	let appearance = $state(persona?.appearance ?? '');
	let personality = $state(persona?.personality ?? '');

	// ── Pronouns ───────────────────────────────────────────────────────
	const pronounOptions = ['they/them', 'she/her', 'he/him', 'custom'] as const;
	let selectedPronouns = $state<string>(
		pronounOptions.includes(persona?.pronouns as any) ? persona!.pronouns : (persona?.pronouns ? 'custom' : 'they/them')
	);
	let customPronouns = $state(
		pronounOptions.includes(persona?.pronouns as any) ? '' : (persona?.pronouns ?? '')
	);

	function getResolvedPronouns(): string {
		if (selectedPronouns === 'custom') return customPronouns.trim();
		return selectedPronouns;
	}

	// ── Avatar ─────────────────────────────────────────────────────────
	let avatarPreview = $state<string | null>(
		resolveFileUrl(persona?.avatar ?? persona?.avatar_file) ?? null
	);
	let fileInput = $state<HTMLInputElement>();
	let avatarFile = $state<File | null>(null);
	let avatarRemoved = $state(false);

	function handleAvatarClick(): void {
		fileInput?.click();
	}

	function handleAvatarChange(e: Event): void {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		avatarFile = file;
		avatarPreview = URL.createObjectURL(file);
		input.value = '';
	}

	function handleRemoveAvatar(): void {
		if (avatarPreview?.startsWith('blob:')) {
			URL.revokeObjectURL(avatarPreview);
		}
		avatarPreview = null;
		avatarFile = null;
		avatarRemoved = true;
		if (fileInput) fileInput.value = '';
	}

	// ── Submission ─────────────────────────────────────────────────────
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);

	const canSave = $derived(name.trim().length > 0 && !saving);

	async function handleSave(): Promise<void> {
		if (!canSave) return;
		saving = true;
		errorMessage = null;

		try {
			const pronounsValue = getResolvedPronouns();

			if (mode === 'create') {
				const input: CreatePersonaInput = {
					name: name.trim(),
					...(description.trim() ? { description: description.trim() } : {}),
					...(appearance.trim() ? { appearance: appearance.trim() } : {}),
					...(personality.trim() ? { personality: personality.trim() } : {}),
					...(pronounsValue ? { pronouns: pronounsValue } : {}),
				};
				const result = await createPersona(input);
				if (result && avatarFile) {
					await uploadAvatar('personas', result.id, avatarFile);
				}
			} else {
				const input: UpdatePersonaInput = {
					name: name.trim(),
					...(description.trim() ? { description: description.trim() } : {}),
					...(appearance.trim() ? { appearance: appearance.trim() } : {}),
					...(personality.trim() ? { personality: personality.trim() } : {}),
					...(pronounsValue ? { pronouns: pronounsValue } : {}),
				};
				const result = await updatePersona(persona!.id, input);
				if (result && avatarFile) {
					await uploadAvatar('personas', result.id, avatarFile);
				} else if (result && avatarRemoved) {
					await updatePersona(persona!.id, { avatar: null });
				}
			}

			await loadPersonas();
			closePersonaFormModal();
		} catch {
			errorMessage = 'An unexpected error occurred.';
		} finally {
			saving = false;
		}
	}
</script>

<Modal title={mode === 'create' ? 'Create Persona' : 'Edit Persona'} onclose={closePersonaFormModal}>
	<div class="persona-form">
		{#if errorMessage}
			<div class="modal__error">{errorMessage}</div>
		{/if}

		<!-- Avatar picker -->
		<div class="modal__field">
			<label class="modal__label">Avatar</label>
			<div class="modal__avatar-area">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="modal__avatar-picker"
					class:modal__avatar-picker--has-image={avatarPreview}
					onclick={handleAvatarClick}
					role="button"
					tabindex="0"
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAvatarClick(); }}
				>
					{#if avatarPreview}
						<img src={avatarPreview} alt="Avatar preview" class="modal__avatar-img" />
						<div class="modal__avatar-overlay">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
								<circle cx="12" cy="13" r="4" />
							</svg>
						</div>
					{:else}
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
							<circle cx="12" cy="13" r="4" />
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
				<div class="modal__avatar-hint">
					<span class="modal__avatar-hint-title">Profile picture</span>
					<span class="modal__avatar-hint-text">Recommended: 512×512px or larger. PNG, JPG, or WebP.</span>
				</div>
			</div>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/avif"
				class="modal__file-input"
				onchange={handleAvatarChange}
			/>
		</div>

		<!-- Name -->
		<div class="modal__field">
			<label class="modal__label" for="persona-name">Name <span class="modal__required">*</span></label>
			<input
				id="persona-name"
				class="modal__input"
				type="text"
				placeholder="Your character's name"
				bind:value={name}
			/>
		</div>

		<!-- Pronouns -->
		<div class="modal__field">
			<label class="modal__label">Pronouns <span class="modal__label-optional">(optional)</span></label>
			<div class="pronouns-group">
				{#each pronounOptions as option}
					<button
						type="button"
						class="pronouns-btn"
						class:pronouns-btn--active={selectedPronouns === option}
						onclick={() => (selectedPronouns = option)}
					>{option}</button>
				{/each}
			</div>
			{#if selectedPronouns === 'custom'}
				<input
					class="modal__input"
					type="text"
					placeholder="Enter custom pronouns"
					bind:value={customPronouns}
				/>
			{/if}
		</div>

		<!-- Description -->
		<div class="modal__field">
			<label class="modal__label" for="persona-description">Description <span class="modal__label-optional">(optional)</span></label>
			<textarea
				id="persona-description"
				class="modal__textarea"
				rows="3"
				placeholder="A brief summary of who this persona is"
				bind:value={description}
			></textarea>
			<span class="char-count">{description.length} / 500</span>
		</div>

		<!-- Appearance -->
		<div class="modal__field">
			<label class="modal__label" for="persona-appearance">Appearance <span class="modal__label-optional">(optional)</span></label>
			<textarea
				id="persona-appearance"
				class="modal__textarea"
				rows="4"
				placeholder="How does this persona look? (height, build, hair, clothing style, distinguishing features)"
				bind:value={appearance}
			></textarea>
		</div>

		<!-- Personality -->
		<div class="modal__field">
			<label class="modal__label" for="persona-personality">Personality <span class="modal__label-optional">(optional)</span></label>
			<textarea
				id="persona-personality"
				class="modal__textarea"
				rows="4"
				placeholder="Key personality traits, behaviors, and quirks"
				bind:value={personality}
			></textarea>
		</div>
	</div>

	{#snippet footer()}
		<div class="modal__footer-buttons">
			<button class="modal__btn modal__btn--cancel" onclick={closePersonaFormModal}>Cancel</button>
			<button
				class="modal__btn modal__btn--save"
				disabled={!canSave}
				onclick={handleSave}
			>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	{/snippet}
</Modal>

<style>
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

	.modal__label-optional {
		font-weight: var(--font-weight-normal);
		color: var(--text-muted);
		font-size: var(--font-size-xs);
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

	.modal__avatar-picker--has-image {
		border-style: solid;
		border-color: var(--border);
	}

	.modal__avatar-picker--has-image:hover .modal__avatar-overlay {
		opacity: 1;
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

	.modal__avatar-hint {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-top: var(--space-2);
	}

	.modal__avatar-hint-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-secondary);
	}

	.modal__avatar-hint-text {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		line-height: 1.4;
	}

	/* ── Pronouns selector ────────────────────────────────────────────── */
	.pronouns-group {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.pronouns-btn {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.pronouns-btn:hover {
		border-color: var(--text-muted);
		color: var(--text);
	}

	.pronouns-btn--active {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* ── Character count ──────────────────────────────────────────────── */
	.char-count {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		text-align: right;
	}

	/* ── Footer ───────────────────────────────────────────────────────── */
	.modal__footer-buttons {
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
