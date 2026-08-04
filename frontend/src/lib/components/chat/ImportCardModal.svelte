<script lang="ts">
	import type { ApiCharacterCard } from '$lib/api/chat';
	import { PUBLIC_API_BASE_URL } from '$env/static/public';

	let {
		onclose,
		onimported,
	}: {
		onclose: () => void;
		onimported: (card: ApiCharacterCard) => void;
	} = $props();

	const BASE = (PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

	// ── State ─────────────────────────────────────────────────────────────
	let dragging = $state(false);
	let importing = $state(false);
	let errorMessage = $state('');
	let jsonText = $state('');
	let fileInputEl: HTMLInputElement | undefined = $state();

	// ── Derived ───────────────────────────────────────────────────────────
	const hasContent = $derived(jsonText.trim().length > 0);

	// ── Handlers ──────────────────────────────────────────────────────────

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}

	function handleDragOver(e: DragEvent): void {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave(): void {
		dragging = false;
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		dragging = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
		importFile(files[0]!);
	}
	}

	function handleFileSelect(e: Event): void {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (files && files.length > 0) {
			importFile(files[0]!);
		}
		// Reset so the same file can be selected again
		input.value = '';
	}

	function openFilePicker(): void {
		fileInputEl?.click();
	}

	/**
	 * Read a file as a base64 data URI, extract the raw base64 portion,
	 * and POST to the import endpoint.
	 */
	function importFile(file: File): Promise<void> {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = async () => {
				const dataUri = reader.result as string;
				// dataUri looks like "data:image/png;base64,iVBOR..." or "data:application/json;base64,..."
				const base64 = dataUri.split(',')[1] ?? '';
				await sendImport({ data: base64 });
				resolve();
			};
			reader.onerror = () => {
				errorMessage = 'Failed to read the file.';
				resolve();
			};
			reader.readAsDataURL(file);
		});
	}

	/**
	 * Import from pasted JSON text. Parse it and send the object directly.
	 */
	function importJsonText(): void {
		const text = jsonText.trim();
		if (!text) {
			errorMessage = 'Please paste some JSON text first.';
			return;
		}
		try {
			const parsed: unknown = JSON.parse(text);
			sendImport(parsed);
		} catch {
			errorMessage = 'Invalid JSON — could not parse the pasted text.';
		}
	}

	/**
	 * POST to the backend import endpoint.
	 */
	async function sendImport(body: unknown): Promise<void> {
		errorMessage = '';
		importing = true;
		try {
			const res = await fetch(`${BASE}/api/cards/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				let message = `Import failed (HTTP ${res.status})`;
				try {
					const errBody = await res.json() as { error?: { message?: string } };
					if (errBody.error?.message) message = errBody.error.message;
				} catch { /* non-JSON error body */ }
				errorMessage = message;
				return;
			}
			const card = (await res.json()) as ApiCharacterCard;
			onimported(card);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Network error — could not reach the server.';
		} finally {
			importing = false;
		}
	}

	function handleImport(): void {
		if (hasContent) {
			importJsonText();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
	<div class="modal" role="dialog" aria-labelledby="import-card-title">
		<div class="modal__header">
			<h2 id="import-card-title" class="modal__header-title">Import Character Card</h2>
			<button class="modal__close" onclick={onclose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<div class="modal__body">
			<!-- Drop zone -->
			<div
				class="dropzone"
				class:dropzone--active={dragging}
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				onclick={openFilePicker}
			>
				<svg class="dropzone__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="dropzone__label">Drag & drop or click to upload</p>
				<p class="dropzone__sublabel">Supports: .png (character card) · .json</p>
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".png,.json,image/png,application/json"
					class="dropzone__input"
					onchange={handleFileSelect}
				/>
			</div>

			<!-- Divider -->
			<div class="divider">
				<span class="divider__line"></span>
				<span class="divider__text">or paste JSON</span>
				<span class="divider__line"></span>
			</div>

			<!-- JSON text area -->
			<textarea
				class="json-textarea"
				placeholder='Paste your character card JSON here...'
				spellcheck="false"
				bind:value={jsonText}
			></textarea>

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
			<button class="modal__btn modal__btn--cancel" onclick={onclose} disabled={importing}>
				Cancel
			</button>
			<button
				class="modal__btn modal__btn--import"
				disabled={importing || !hasContent}
				onclick={handleImport}
			>
				{#if importing}
					Importing...
				{:else}
					Import
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
		max-width: 520px;
		width: 100%;
		max-height: 80vh;
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

	/* ── Drop zone ─────────────────────────────────────────────────────── */
	.dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-8) var(--space-4);
		border: 2px dashed var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast);
	}
	.dropzone:hover {
		border-color: var(--accent-soft);
		background: var(--bg-raised);
	}
	.dropzone--active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.dropzone__icon {
		color: var(--text-muted);
		pointer-events: none;
	}

	.dropzone__label {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		pointer-events: none;
	}

	.dropzone__sublabel {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		pointer-events: none;
	}

	.dropzone__input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	/* ── Divider ────────────────────────────────────────────────────────── */
	.divider {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.divider__line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.divider__text {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* ── JSON textarea ─────────────────────────────────────────────────── */
	.json-textarea {
		width: 100%;
		min-height: 120px;
		max-height: 240px;
		padding: var(--space-3);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-family: monospace;
		font-size: var(--font-size-sm);
		line-height: 1.5;
		resize: vertical;
		outline: none;
		transition: border-color var(--transition-fast);
	}
	.json-textarea:focus {
		border-color: var(--accent);
	}
	.json-textarea::placeholder {
		color: var(--text-muted);
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

	.modal__btn--import {
		background: var(--accent);
		color: var(--on-accent);
	}
	.modal__btn--import:hover:not(:disabled) {
		background: var(--accent-hover);
	}
</style>
