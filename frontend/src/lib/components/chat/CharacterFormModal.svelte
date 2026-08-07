<script lang="ts">
	import type { ApiCharacterCard, CreateCardInput, UpdateCardInput } from '$lib/api/chat';
	import { resolveFileUrl, uploadAvatar } from '$lib/api/chat';
	import { saveCard } from '$lib/state/chat.svelte';
	import Modal from './Modal.svelte';
	import Tabs from './Tabs.svelte';

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
	type Tab = 'identity' | 'personality' | 'scenario' | 'player-persona';
	let activeTab = $state<Tab>('identity');

	type ScenarioEntry = {
		id: string;
		name: string;
		description: string;
		scenario: string;
		first_message: string;
	};

	// ── Form fields (initialized from importedData, card, or empty) ────────
	// We intentionally capture the prop's initial value here — the modal is
	// created fresh per open, so reactivity is not needed.
	let name = $state(importedData?.name ?? card?.name ?? '');
	let tagline = $state(importedData?.tagline ?? card?.tagline ?? '');
	let description = $state(importedData?.description ?? card?.description ?? '');
	let personality = $state(importedData?.personality ?? card?.personality ?? '');
	let speechStyle = $state(importedData?.speech_style ?? card?.speech_style ?? '');
	let likesAndDislikes = $state(importedData?.likes_and_dislikes ?? card?.likes_and_dislikes ?? '');

	// ── Default Persona fields ──────────────────────────────────────────────
	const dp = importedData?.default_persona ?? card?.default_persona ?? null;
	let dpLabel = $state(dp?.label ?? '');
	let dpName = $state(dp?.name ?? '{{player_name}}');
	let dpRole = $state(dp?.role ?? '');
	let dpBackground = $state(dp?.background ?? '');
	let dpPersonality = $state(dp?.personality ?? '');
	let dpAppearance = $state(dp?.appearance ?? '');
	let dpPronouns = $state(dp?.pronouns ?? '');
	let dpDetails = $state(dp?.details ?? '');

	const dpIsEmpty = $derived(
		!dpLabel.trim() && !dpRole.trim() && !dpBackground.trim() && !dpPersonality.trim() && !dpAppearance.trim()
	);
	/** Initialize scenario list from card data, imported data, or a single blank entry. */
	function initScenarios(): ScenarioEntry[] {
		// Edit mode: use card's starting_scenarios, or wrap legacy fields
		if (card) {
			if (card.starting_scenarios.length > 0) {
				return card.starting_scenarios.map((s) => ({
					id: s.id,
					name: s.name,
					description: s.description ?? '',
					scenario: s.scenario,
					first_message: s.first_message,
				}));
			}
			if (card.scenario || card.first_message) {
				return [{
					id: 'default',
					name: 'Default',
					description: '',
					scenario: card.scenario,
					first_message: card.first_message ?? '',
				}];
			}
			return [createBlankScenario()];
		}

		// Create mode with import
		if (importedData?.starting_scenarios && importedData.starting_scenarios.length > 0) {
			return importedData.starting_scenarios.map((s) => ({
				id: s.id,
				name: s.name,
				description: s.description ?? '',
				scenario: s.scenario,
				first_message: s.first_message,
			}));
		}
		if (importedData?.scenario || importedData?.first_message) {
			return [{
				id: 'default',
				name: 'Default',
				description: '',
				scenario: importedData.scenario ?? '',
				first_message: importedData.first_message ?? '',
			}];
		}

		return [createBlankScenario()];
	}

	function createBlankScenario(): ScenarioEntry {
		return { id: crypto.randomUUID(), name: '', description: '', scenario: '', first_message: '' };
	}

	let scenarios = $state<ScenarioEntry[]>(initScenarios());

	// ── Submission state ───────────────────────────────────────────────────
	let saving = $state(false);

	const canSave = $derived(name.trim().length > 0 && !saving);

	// ── Scenario helpers ───────────────────────────────────────────────────
	let expandedScenarioIds = $state<Record<string, boolean>>({});
	let scenarioErrors = $state<Record<string, Record<string, string>>>({});

	// Auto-expand first scenario on mount
	$effect(() => {
		if (scenarios.length > 0 && Object.keys(expandedScenarioIds).length === 0) {
			expandedScenarioIds[scenarios[0].id] = true;
		}
	});

	function toggleExpanded(id: string): void {
		expandedScenarioIds[id] = !expandedScenarioIds[id];
	}

	function isExpanded(id: string): boolean {
		return expandedScenarioIds[id] ?? false;
	}

	function addScenario(): void {
		if (scenarios.length >= 12) return;
		const entry = createBlankScenario();
		scenarios.push(entry);
		expandedScenarioIds[entry.id] = true;
		// Scroll into view after DOM update
		requestAnimationFrame(() => {
			const el = document.getElementById(`scenario-card-${entry.id}`);
			el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	function removeScenario(id: string): void {
		const idx = scenarios.findIndex((s) => s.id === id);
		if (idx < 0) return;
		const s = scenarios[idx];
		// Confirmation only if scenario/first_message/description have content
		const needsConfirm = s.scenario.trim() || s.first_message.trim() || s.description.trim();
		if (needsConfirm && !confirm('Remove this scenario?')) return;
		scenarios.splice(idx, 1);
		delete expandedScenarioIds[id];
		delete scenarioErrors[id];
	}

	function scenarioDisplayName(entry: ScenarioEntry, index: number): string {
		return entry.name.trim() || `Scenario ${index + 1}`;
	}

	function validateScenarios(): boolean {
		scenarioErrors = {};
		let firstErrorId: string | null = null;

		for (const entry of scenarios) {
			const errors: Record<string, string> = {};
			if (!entry.name.trim()) errors.name = 'Required';
			if (!entry.scenario.trim()) errors.scenario = 'Required';
			if (!entry.first_message.trim()) errors.first_message = 'Required';

			if (Object.keys(errors).length > 0) {
				scenarioErrors[entry.id] = errors;
				if (!firstErrorId) firstErrorId = entry.id;
			}
		}

		// Auto-expand the first card with errors
		if (firstErrorId) {
			expandedScenarioIds[firstErrorId] = true;
		}

		return Object.keys(scenarioErrors).length === 0;
	}

	/** Clear a specific field error when the user types. */
	function clearScenarioError(id: string, field: string): void {
		if (scenarioErrors[id]) {
			delete scenarioErrors[id][field];
			if (Object.keys(scenarioErrors[id]).length === 0) {
				delete scenarioErrors[id];
			}
		}
	}

	// ── Avatar ────────────────────────────────────────────────────────────
	let avatarPreview = $state<string | null>(resolveFileUrl(importedData?.avatar ?? card?.avatar ?? card?.avatar_file ?? null));
	let fileInput = $state<HTMLInputElement>();
	let avatarFile = $state<File | null>(null);
	let uploading = $state(false);
	// Track whether the user explicitly removed the avatar (so we can send
	// avatar: null in the PATCH to clear avatar_file in the DB).
	let avatarRemoved = $state(false);

	// Avatar management (edit mode)
	let avatars = $state<Array<{ id: string; name?: string; image: string }>>(
		card?.avatars ?? []
	);

	// ── Submission state ───────────────────────────────────────────────────
	let errorMessage = $state<string | null>(null);

	// ── Handlers ──────────────────────────────────────────────────────────
	function handleAvatarClick(): void {
		fileInput?.click();
	}

	function handleAvatarChange(e: Event): void {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Store the File object for upload
		avatarFile = file;

		// Show preview via object URL (not data URL)
		avatarPreview = URL.createObjectURL(file);
		// Reset so the same file can be re-selected
		input.value = '';
	}

	function handleRemoveAvatar(): void {
		if (avatarPreview && avatarPreview.startsWith('blob:')) {
			URL.revokeObjectURL(avatarPreview);
		}
		avatarPreview = null;
		avatarFile = null;
		avatarRemoved = true;
		if (fileInput) fileInput.value = '';
	}

	async function handleReplaceAvatar(index: number, e: Event): Promise<void> {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !card) return;

		uploading = true;
		try {
			const { path } = await uploadAvatar('characters', card.id, file);
			const updated = avatars.map((a, i) => i === index ? { ...a, image: path } : a);
			avatars = updated;
			await saveCard('edit', { avatars }, card.id);
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	function handleRemoveAvatarOption(index: number): void {
		if (!card) return;
		avatars = avatars.filter((_, i) => i !== index);
		// Update DB (file stays on disk for backward compat)
		saveCard('edit', { avatars }, card.id);
	}

	async function handleAddAvatar(e: Event): Promise<void> {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !card) return;

		uploading = true;
		try {
			const { path } = await uploadAvatar('characters', card.id, file);
			const newAvatar = { id: `avatar_${Date.now()}`, name: file.name, image: path };
			avatars = [...avatars, newAvatar];
			await saveCard('edit', { avatars }, card.id);
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function handleSave(): Promise<void> {
		if (!canSave) return;
		if (!validateScenarios()) return;

		saving = true;
		errorMessage = null;

		try {
			let result: ApiCharacterCard | null;

			// Build default_persona from form fields (only if at least one field has content)
			const hasDp = dpLabel.trim() || dpRole.trim() || dpBackground.trim() || dpPersonality.trim() || dpAppearance.trim() || dpPronouns.trim() || dpDetails.trim();
			const defaultPersona = hasDp ? {
				label: dpLabel.trim(),
				name: dpName.trim() || '{{player_name}}',
				role: dpRole.trim(),
				background: dpBackground.trim(),
				personality: dpPersonality.trim(),
				appearance: dpAppearance.trim(),
				pronouns: dpPronouns.trim(),
				details: dpDetails.trim(),
			} : null;

			if (mode === 'create') {
				// Build base input from form fields (without avatar — uploaded separately)
				const baseInput: CreateCardInput = {
					name: name.trim(),
					tagline: tagline.trim() || undefined,
					personality: personality.trim() || undefined,
					speech_style: speechStyle.trim() || undefined,
					likes_and_dislikes: likesAndDislikes.trim() || undefined,
					...(description.trim() ? { description: description.trim() } : {}),
					...(defaultPersona ? { default_persona: defaultPersona } : {}),
				};

				// Merge with imported fields that aren't in the form
				const input: CreateCardInput = {
					...baseInput,
					// Pass through all imported fields that aren't form-editable
					...(importedData?.avatar ? { avatar: importedData.avatar } : {}),
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
					starting_scenarios: scenarios.map((s) => ({
						id: s.id,
						name: s.name.trim(),
						description: s.description.trim() || undefined,
						scenario: s.scenario.trim(),
						first_message: s.first_message.trim(),
					})),
				};

				result = await saveCard('create', input);

				// Upload avatar via FormData if one was selected
				if (result && avatarFile) {
					uploading = true;
					try {
						const { path } = await uploadAvatar('characters', result.id, avatarFile);
						result = await saveCard('edit', { avatar: path }, result.id);
					} finally {
						uploading = false;
					}
				}
			} else {
				// Edit mode: only send fields the form controls
				const input: UpdateCardInput = {
					name: name.trim(),
					tagline: tagline.trim() || undefined,
					personality: personality.trim() || undefined,
					speech_style: speechStyle.trim() || undefined,
					likes_and_dislikes: likesAndDislikes.trim() || undefined,
					...(description.trim() ? { description: description.trim() } : {}),
					...(defaultPersona ? { default_persona: defaultPersona } : { default_persona: null }),
					starting_scenarios: scenarios.map((s) => ({
						id: s.id,
						name: s.name.trim(),
						description: s.description.trim() || undefined,
						scenario: s.scenario.trim(),
						first_message: s.first_message.trim(),
					})),
				};

				result = await saveCard('edit', input, card?.id);

				// Upload avatar via FormData if one was selected
				if (result && avatarFile) {
					uploading = true;
					try {
						const { path } = await uploadAvatar('characters', result.id, avatarFile);
						result = await saveCard('edit', { avatar: path }, result.id);
					} finally {
						uploading = false;
					}
				} else if (result && avatarRemoved) {
					// Avatar was explicitly removed — clear it in the DB
					result = await saveCard('edit', { avatar: null }, result.id);
				}
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

<Modal
	title={importedData ? 'Create Character (Imported)' : mode === 'create' ? 'Create Character' : 'Edit Character'}
	{onclose}
	aria-labelledby="character-form-title"
>
	{#snippet tabs()}
		<Tabs
			tabs={[
				{ id: 'identity', label: 'Identity' },
				{ id: 'personality', label: 'Personality' },
				{ id: 'scenario', label: 'Scenario' },
				{ id: 'player-persona', label: 'Player Persona' },
			]}
			active={activeTab}
			onchange={(id) => (activeTab = id as Tab)}
		/>
	{/snippet}

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
								{#if uploading}
									<div class="modal__avatar-uploading">
										<span>Uploading...</span>
									</div>
								{:else}
									<div class="modal__avatar-overlay">
										<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
											<circle cx="12" cy="13" r="4"/>
										</svg>
									</div>
								{/if}
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
						accept="image/png,image/jpeg,image/webp,image/avif"
						class="modal__file-input"
						onchange={handleAvatarChange}
					/>
				</div>

				<!-- Avatar options (edit mode only) -->
				{#if mode === 'edit' && avatars.length > 0}
					<div class="modal__field">
						<label class="modal__label">Avatar Options</label>
						<div class="modal__avatar-options">
							{#each avatars as avatar, i (avatar.id)}
								<div class="modal__avatar-option">
									<img src={resolveFileUrl(avatar.image)} alt={avatar.name ?? `Option ${i + 1}`} class="modal__avatar-option-img" />
									<div class="modal__avatar-option-actions">
										<label class="modal__avatar-option-btn" title="Replace">
											<input type="file" accept="image/*" class="modal__file-input-hidden" onchange={(e) => handleReplaceAvatar(i, e)} />
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
												<circle cx="12" cy="13" r="4"/>
											</svg>
										</label>
										<button class="modal__avatar-option-btn" onclick={() => handleRemoveAvatarOption(i)} title="Remove">
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M18 6L6 18M6 6l12 12"/>
											</svg>
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if mode === 'edit'}
					<div class="modal__field">
						<label class="modal__label">
							<span class="modal__avatar-add-btn">
								<input type="file" accept="image/*" class="modal__file-input-hidden" onchange={handleAddAvatar} />
								+ Add Avatar
							</span>
						</label>
					</div>
				{/if}

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
				<div class="scenario-list">
					{#each scenarios as entry, i (entry.id)}
						<div
							class="scenario-card"
							class:scenario-card--expanded={isExpanded(entry.id)}
							id="scenario-card-{entry.id}"
						>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="scenario-card__header"
								onclick={() => toggleExpanded(entry.id)}
							>
								<span class="scenario-card__title">
									{scenarioDisplayName(entry, i)}
									{#if i === 0}
										<span class="scenario-card__badge">Default</span>
									{/if}
								</span>
								<div class="scenario-card__header-actions">
									{#if scenarios.length > 1}
										<button
											class="scenario-card__remove"
											title="Remove scenario"
											onclick={(e) => { e.stopPropagation(); removeScenario(entry.id); }}
										>
											×
										</button>
									{/if}
									<span class="scenario-card__chevron">
										{isExpanded(entry.id) ? '▾' : '▸'}
									</span>
								</div>
							</div>

							{#if isExpanded(entry.id)}
								<div class="scenario-card__body">
									<div class="modal__field">
										<label class="modal__label" for="scenario-name-{entry.id}">Name</label>
										<input
											id="scenario-name-{entry.id}"
											class="modal__input"
											class:modal__input--error={scenarioErrors[entry.id]?.name}
											type="text"
											placeholder="e.g. Summer Vacation, Dark Timeline"
											bind:value={entry.name}
											oninput={() => clearScenarioError(entry.id, 'name')}
										/>
										{#if scenarioErrors[entry.id]?.name}
											<span class="modal__field-error">{scenarioErrors[entry.id].name}</span>
										{/if}
									</div>

									<div class="modal__field">
										<label class="modal__label" for="scenario-desc-{entry.id}">Description <span class="modal__label-optional">(optional)</span></label>
										<input
											id="scenario-desc-{entry.id}"
											class="modal__input"
											type="text"
											placeholder="Short subtitle for the scenario picker"
											bind:value={entry.description}
										/>
									</div>

									<div class="modal__field">
										<label class="modal__label" for="scenario-text-{entry.id}">Scenario</label>
										<textarea
											id="scenario-text-{entry.id}"
											class="modal__textarea"
											class:modal__textarea--error={scenarioErrors[entry.id]?.scenario}
											rows="5"
											placeholder="Setting, context, and situation for this starting scenario"
											bind:value={entry.scenario}
											oninput={() => clearScenarioError(entry.id, 'scenario')}
										></textarea>
										{#if scenarioErrors[entry.id]?.scenario}
											<span class="modal__field-error">{scenarioErrors[entry.id].scenario}</span>
										{/if}
									</div>

									<div class="modal__field">
										<label class="modal__label" for="scenario-first-{entry.id}">First Message</label>
										<textarea
											id="scenario-first-{entry.id}"
											class="modal__textarea"
											class:modal__textarea--error={scenarioErrors[entry.id]?.first_message}
											rows="6"
											placeholder="The character's opening message for this scenario"
											bind:value={entry.first_message}
											oninput={() => clearScenarioError(entry.id, 'first_message')}
										></textarea>
										{#if scenarioErrors[entry.id]?.first_message}
											<span class="modal__field-error">{scenarioErrors[entry.id].first_message}</span>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<button
					class="scenario-add-btn"
					disabled={scenarios.length >= 12}
					title={scenarios.length >= 12 ? 'Maximum 12 scenarios' : 'Add another starting scenario'}
					onclick={addScenario}
				>
					+ Add Scenario
				</button>
		{/if}

			{#if activeTab === 'player-persona'}
				<div class="modal__dp-header">
					<h3 class="modal__dp-title">Default Player Persona</h3>
					<p class="modal__dp-subtitle">Define who the player is in this story. The player can still rename themselves at New Play time.</p>
				</div>

				{#if dpIsEmpty}
					<div class="modal__dp-warning">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
							<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
						</svg>
						Recommended: describe who the player is in this story for the best experience.
					</div>
				{/if}

				<div class="modal__field">
					<label class="modal__label" for="dp-label">Label <span class="modal__label-optional">(shown in UI)</span></label>
					<input
						id="dp-label"
						class="modal__input"
						type="text"
						placeholder="e.g. Childhood friend, Rival, New student"
						bind:value={dpLabel}
					/>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-role">Role</label>
					<input
						id="dp-role"
						class="modal__input"
						type="text"
						placeholder="e.g. Classmate, Informant, Love Interest"
						bind:value={dpRole}
					/>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-background">Background</label>
					<textarea
						id="dp-background"
						class="modal__textarea"
						rows="3"
						placeholder="Who is the player in this world? History, context, social standing..."
						bind:value={dpBackground}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-personality">Personality</label>
					<textarea
						id="dp-personality"
						class="modal__textarea"
						rows="3"
						placeholder="Personality traits the AI should use for the player character"
						bind:value={dpPersonality}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-appearance">Appearance</label>
					<textarea
						id="dp-appearance"
						class="modal__textarea"
						rows="3"
						placeholder="Physical appearance for prompt context"
						bind:value={dpAppearance}
					></textarea>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-pronouns">Pronouns</label>
					<input
						id="dp-pronouns"
						class="modal__input"
						type="text"
						placeholder="e.g. she/her, he/him, they/them"
						bind:value={dpPronouns}
					/>
				</div>

				<div class="modal__field">
					<label class="modal__label" for="dp-details">Additional Details</label>
					<textarea
						id="dp-details"
						class="modal__textarea"
						rows="3"
						placeholder="Anything else the AI should know about the player character"
						bind:value={dpDetails}
					></textarea>
				</div>
			{/if}

	{#snippet footer()}
		<div class="modal__footer-buttons">
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
	{/snippet}
</Modal>

<style>
	/* ── Body layout ──────────────────────────────────────────────────── */
	:global(.modal__body) {
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

	.modal__avatar-uploading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: var(--font-size-xs);
		border-radius: var(--radius-md);
	}

	/* ── Avatar options ─────────────────────────────────────────────── */
	.modal__avatar-options {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
		gap: var(--space-2);
	}
	.modal__avatar-option {
		position: relative;
		aspect-ratio: 1;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border);
	}
	.modal__avatar-option-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.modal__avatar-option-actions {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		gap: 2px;
		padding: 2px;
		background: rgba(0, 0, 0, 0.6);
		justify-content: center;
	}
	.modal__avatar-option-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: transparent;
		color: white;
		border: none;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.modal__avatar-option-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}
	.modal__avatar-add-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--accent);
		border: 1px dashed var(--accent);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.modal__avatar-add-btn:hover {
		background: var(--accent-soft);
	}
	.modal__file-input-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
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

	/* ── Scenario cards ──────────────────────────────────────────────── */
	.scenario-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.scenario-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}
	.scenario-card--expanded {
		border-color: var(--accent-muted);
	}

	.scenario-card__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		cursor: pointer;
		user-select: none;
		transition: background var(--transition-fast);
	}
	.scenario-card__header:hover {
		background: var(--accent-soft);
	}

	.scenario-card__title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
	}

	.scenario-card__badge {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--accent);
		background: var(--accent-soft);
		padding: 1px 6px;
		border-radius: var(--radius-pill);
	}

	.scenario-card__header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.scenario-card__remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		font-size: 16px;
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.scenario-card__remove:hover {
		background: var(--danger-soft, rgba(239, 68, 68, 0.12));
		color: var(--danger, #ef4444);
	}

	.scenario-card__chevron {
		color: var(--icon);
		font-size: 12px;
	}

	.scenario-card__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--space-4) var(--space-4);
	}

	.scenario-add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
	}
	.scenario-add-btn:hover:not(:disabled) {
		border-color: var(--accent-muted);
		color: var(--accent);
		background: var(--accent-soft);
	}
	.scenario-add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Validation error styles ─────────────────────────────────────── */
	.modal__input--error,
	.modal__textarea--error {
		border-color: var(--danger, #ef4444) !important;
	}

	.modal__field-error {
		font-size: var(--font-size-xs);
		color: var(--danger, #ef4444);
		margin-top: 2px;
	}

	.modal__label-optional {
		font-weight: var(--font-weight-normal);
		color: var(--text-muted);
		font-size: var(--font-size-xs);
	}

	/* ── Player Persona section ────────────────────────────────────────── */
	.modal__dp-header {
		margin-bottom: var(--space-3);
	}

	.modal__dp-title {
		margin: 0 0 var(--space-1);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.modal__dp-subtitle {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.modal__dp-warning {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		background: rgba(251, 191, 36, 0.08);
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: var(--radius-md);
		color: #f59e0b;
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-3);
	}
</style>
