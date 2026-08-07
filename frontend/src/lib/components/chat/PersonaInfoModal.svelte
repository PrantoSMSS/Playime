<script lang="ts">
	import Modal from './Modal.svelte';
	import DeleteConfirmButton from './DeleteConfirmButton.svelte';
	import {
		chat,
		closePersonaInfoModal,
		openPersonaFormModal,
		loadPersonas,
	} from '$lib/state/chat.svelte';
	import { deletePersona, resolveFileUrl } from '$lib/api/chat';

	let persona = $derived(chat.personaInfoModal?.persona!);
	let isDefault = $derived(persona?.id === 'myself');
	let deleting = $state(false);

	function handleEdit(): void {
		openPersonaFormModal('edit', persona);
	}

	async function handleDelete(): Promise<void> {
		deleting = true;
		try {
			await deletePersona(persona.id);
			await loadPersonas();
			closePersonaInfoModal();
		} catch {
			deleting = false;
		}
	}

	function formatDate(ts: number): string {
		const d = new Date(ts);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffH = Math.floor(diffMs / 3600000);
		const diffD = Math.floor(diffMs / 86400000);
		if (diffH < 1) return 'just now';
		if (diffH < 24) return `${diffH}h ago`;
		if (diffD < 7) return `${diffD}d ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getInitials(name: string): string {
		return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
	}

	function getAvatarUrl(): string | null {
		return resolveFileUrl(persona?.avatar ?? persona?.avatar_file);
	}
</script>

<Modal title="Persona Information" onclose={closePersonaInfoModal} backdropclose={false}>
	{#if isDefault}
		<!-- John Doe default persona — clean, read-only layout (john-doe.html) -->
		<div class="persona-info">
			<div class="persona-info__top">
				<div class="persona-info__avatar">
					{#if getAvatarUrl()}
						<img src={getAvatarUrl()} alt={persona.name} />
					{:else}
						<svg class="persona-info__avatar-placeholder" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
					{/if}
				</div>
				<div class="persona-info__details">
					<h3 class="persona-info__name">{persona.name}</h3>
					<p class="persona-info__tagline">The default persona for storytelling. Its appearance, personality, and pronouns depend on the story.</p>
				</div>
			</div>
		</div>
	{:else}
		<!-- Custom persona — full detail layout -->
		<div class="persona-info">
			<!-- Top: avatar + info -->
			<div class="persona-info__top">
				<div class="persona-info__avatar">
					{#if getAvatarUrl()}
						<img src={getAvatarUrl()} alt={persona.name} />
					{:else}
						<svg class="persona-info__avatar-placeholder" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
							<circle cx="12" cy="7" r="4" />
						</svg>
					{/if}
				</div>
				<div class="persona-info__details">
					<h3 class="persona-info__name">{persona.name}</h3>
					{#if persona.pronouns}
						<span class="persona-info__pronouns">{persona.pronouns}</span>
					{/if}
					{#if persona.description}
						<p class="persona-info__description">{persona.description}</p>
					{/if}
					<div class="persona-info__meta">
						<span class="persona-info__meta-item">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" />
								<line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
							</svg>
							<span>Created {formatDate(persona.created_at)}</span>
						</span>
						<span class="persona-info__meta-item">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
							</svg>
							<span>Updated {formatDate(persona.updated_at)}</span>
						</span>
					</div>
				</div>
			</div>

			<!-- Appearance section -->
			{#if persona.appearance}
				<div class="persona-info__section">
					<h3 class="persona-info__section-title">Appearance</h3>
					<p class="persona-info__section-text">{persona.appearance}</p>
				</div>
			{/if}

			<!-- Personality section -->
			{#if persona.personality}
				<div class="persona-info__section">
					<h3 class="persona-info__section-title">Personality</h3>
					<p class="persona-info__section-text">{persona.personality}</p>
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<div class="persona-info__footer">
			{#if isDefault}
				<span class="persona-info__default-note">This is the built-in default persona. Its personality and appearance are set by each character or story you play.</span>
				<button class="modal__btn modal__btn--primary" onclick={closePersonaInfoModal}>Done</button>
			{:else}
				<DeleteConfirmButton
					label="Delete this persona?"
					onconfirm={handleDelete}
					disabled={deleting}
				/>
				<div class="persona-info__footer-right">
					<button class="modal__btn--ghost" onclick={handleEdit}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
						Edit
					</button>
					<button class="modal__btn modal__btn--primary" onclick={closePersonaInfoModal}>Done</button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>

<style>
	/* ── Top section ──────────────────────────────────────────────────── */
	.persona-info__top {
		display: flex;
		gap: var(--space-4);
	}

	.persona-info__avatar {
		flex-shrink: 0;
		width: 140px;
		height: 140px;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--bg-raised);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.persona-info__avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.persona-info__avatar-placeholder {
		color: var(--text-muted);
		opacity: 0.4;
	}

	.persona-info__details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.persona-info__name {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.persona-info__tagline {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.persona-info__pronouns {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px var(--space-2);
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		width: fit-content;
	}

	.persona-info__description {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.persona-info__meta {
		display: flex;
		gap: var(--space-4);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.persona-info__meta-item {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* ── Sections ──────────────────────────────────────────────────────── */
	.persona-info__section {
		margin-top: var(--space-2);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.persona-info__section:first-child {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}

	.persona-info__section-title {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
	}

	.persona-info__section-text {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.6;
		white-space: pre-wrap;
	}

	/* ── Footer ────────────────────────────────────────────────────────── */
	.persona-info__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.persona-info__footer-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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

	.modal__btn--primary {
		background: var(--accent);
		color: var(--on-accent);
	}

	.modal__btn--primary:hover {
		background: var(--accent-hover);
	}

	.modal__btn--ghost {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
	}

	.modal__btn--ghost:hover {
		color: var(--text);
		border-color: var(--text-muted);
		background: var(--bg-raised);
	}

	.persona-info__default-note {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		font-style: italic;
	}
</style>
