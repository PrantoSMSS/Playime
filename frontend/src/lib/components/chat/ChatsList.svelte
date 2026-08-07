<script lang="ts">
	import {
		chat, deleteSession, resetSession, loadSessionMessages,
		toggleSelection, selectAll, enterSelectionMode, exitSelectionMode,
		bulkDeleteSessions, bulkResetSessions,
	} from '$lib/state/chat.svelte';
	import { nav, recordsTab } from '$lib/state/nav.svelte';
	import type { ChatSession } from '$lib/types/chat';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	// ── Dropdown menu state ────────────────────────────────────────────────
	let menuOpenId = $state<string | null>(null);

	const filteredSessions = $derived(
		chat.sessions.filter((s) => s.kind === recordsTab.tab),
	);

	const selectedCount = $derived.by(() => Object.keys(chat.selectedSessionIds).length);
	const allVisibleSelected = $derived.by(() =>
		filteredSessions.length > 0 && filteredSessions.every((s) => chat.selectedSessionIds[s.id]),
	);

	// ── Relative timestamp ─────────────────────────────────────────────────
	function formatRelativeTime(ts: number): string {
		const diff = Date.now() - ts;
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'now';
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		const days = Math.floor(hrs / 24);
		if (days < 7) {
			return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' });
		}
		return new Date(ts).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
		});
	}

	// ── Handlers ───────────────────────────────────────────────────────────
	async function handleSessionClick(s: ChatSession): Promise<void> {
		if (chat.selectionMode) {
			toggleSelection(s.id);
			return;
		}
		chat.activeSessionId = s.id;
		nav.activeView = 'conversation';
		// Load messages from backend if not already loaded
		if (!chat.messagesBySession[s.id]?.length) {
			await loadSessionMessages(s.id);
		}
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && chat.selectionMode) {
			exitSelectionMode();
		}
	}

	function toggleMenu(e: MouseEvent, sessionId: string): void {
		e.stopPropagation();
		menuOpenId = menuOpenId === sessionId ? null : sessionId;
	}

	async function handleDelete(e: MouseEvent, sessionId: string): Promise<void> {
		e.stopPropagation();
		await deleteSession(sessionId);
		menuOpenId = null;
	}

	async function handleReset(e: MouseEvent, sessionId: string): Promise<void> {
		e.stopPropagation();
		await resetSession(sessionId);
		menuOpenId = null;
	}

	function handleClickOutside(): void {
		menuOpenId = null;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="history-list" onclick={handleClickOutside}>
	<div class="history-list__header">
		{#if chat.selectionMode}
			<h2 class="history-list__title">Select conversations</h2>
		{:else}
			<h2 class="history-list__title">Records</h2>
		{/if}
		<div class="history-list__header-actions">
			{#if chat.selectionMode}
				<button class="history-list__select-all" onclick={() => selectAll(filteredSessions.map((s) => s.id))}>
					{allVisibleSelected ? 'Deselect All' : 'Select All'}
				</button>
				{#if selectedCount > 0}
					<button class="history-list__action-btn history-list__action-btn--delete" onclick={bulkDeleteSessions}>
						Delete ({selectedCount})
					</button>
					<button class="history-list__action-btn history-list__action-btn--reset" onclick={bulkResetSessions}>
						Reset ({selectedCount})
					</button>
				{/if}
				<button class="history-list__done-btn" onclick={exitSelectionMode}>Cancel</button>
			{:else}
				<div class="history-list__tabs" role="tablist">
					<button
						class="history-list__tab"
						class:history-list__tab--active={recordsTab.tab === 'story'}
						role="tab"
						onclick={() => (recordsTab.tab = 'story')}
					>
						Story
					</button>
					<button
						class="history-list__tab"
						class:history-list__tab--active={recordsTab.tab === 'character'}
						role="tab"
						onclick={() => (recordsTab.tab = 'character')}
					>
						Character
					</button>
				</div>
				<button class="history-list__select-btn" onclick={enterSelectionMode}>Select</button>
			{/if}
		</div>
	</div>

	<div class="history-list__items">
		{#if filteredSessions.length === 0}
			<p class="history-list__empty">No {recordsTab.tab} sessions yet.</p>
		{/if}
		{#each filteredSessions as s (s.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="history-list__item"
				class:history-list__item--active={!chat.selectionMode && chat.activeSessionId === s.id}
				class:history-list__item--selected={chat.selectedSessionIds[s.id]}
				onclick={() => handleSessionClick(s)}
			>
				{#if chat.selectionMode}
					<div class="history-list__checkbox">
						<input
							type="checkbox"
							checked={!!chat.selectedSessionIds[s.id]}
							onclick={(e) => { e.stopPropagation(); toggleSelection(s.id); }}
							tabindex="-1"
						/>
					</div>
				{/if}
				<div class="history-list__avatar">
					<Avatar initials={s.initials} hue={s.hue} size={48}>
						{#if s.avatarUrl}
							<img src={s.avatarUrl} alt={s.title} />
						{/if}
					</Avatar>
				</div>
				<div class="history-list__content">
					<div class="history-list__row">
						<span class="history-list__name">{s.title}</span>
						<span class="history-list__time">{formatRelativeTime(s.createdAt)}</span>
					</div>
					<div class="history-list__row">
						<span class="history-list__preview">{s.preview}</span>
						{#if !chat.selectionMode}
							<div class="history-list__menu-wrap">
								<button
									class="history-list__dots"
									onclick={(e) => toggleMenu(e, s.id)}
									aria-label="More options"
								>
									<Icon name="dots" size={16} />
								</button>
								{#if menuOpenId === s.id}
									<div class="history-list__dropdown" onclick={(e) => e.stopPropagation()}>
										<button class="history-list__dropdown-item" onclick={(e) => handleDelete(e, s.id)}>
											Delete conversation
										</button>
										<button class="history-list__dropdown-item" onclick={(e) => handleReset(e, s.id)}>
											Reset chat
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>

</div>

<style>
	.history-list {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ---- Header ---- */
	.history-list__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.history-list__title {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		margin: 0;
	}
	.history-list__tabs {
		display: flex;
		gap: var(--space-1);
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 2px;
	}
	.history-list__tab {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.history-list__tab--active {
		background: var(--accent-muted);
		color: var(--text);
		font-weight: var(--font-weight-medium);
	}

	/* ---- Items list ---- */
	.history-list__items {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-2) 0;
	}
	.history-list__empty {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		padding: var(--space-6);
		text-align: center;
		margin: 0;
	}

	/* ---- Single item ---- */
	.history-list__item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.history-list__item:hover {
		background: var(--bg-raised);
	}
	.history-list__item--active {
		background: var(--accent-soft);
	}

	/* ---- Avatar ---- */
	.history-list__avatar {
		flex-shrink: 0;
	}

	/* ---- Content ---- */
	.history-list__content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.history-list__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.history-list__name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.history-list__time {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.history-list__preview {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	/* ---- "..." menu ---- */
	.history-list__menu-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.history-list__dots {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.history-list__dots:hover {
		background: var(--bg-raised);
		color: var(--text);
	}
	.history-list__dropdown {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 100;
		min-width: 160px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		padding: var(--space-1) 0;
	}
	.history-list__dropdown-item {
		display: block;
		width: 100%;
		padding: var(--space-2) var(--space-4);
		text-align: left;
		font-size: var(--font-size-sm);
		color: var(--text);
		transition: background var(--transition-fast);
	}
	.history-list__dropdown-item:hover {
		background: var(--bg-raised);
	}

	/* ---- Header actions ---- */
	.history-list__header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.history-list__select-btn,
	.history-list__select-all,
	.history-list__done-btn {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.history-list__select-btn {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		color: var(--text-secondary);
	}
	.history-list__select-btn:hover {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}
	.history-list__select-all {
		background: none;
		border: none;
		color: var(--accent);
	}
	.history-list__select-all:hover {
		text-decoration: underline;
	}
	.history-list__done-btn {
		background: var(--accent);
		border: none;
		color: var(--on-accent);
	}
	.history-list__done-btn:hover {
		background: var(--accent-hover);
	}

	/* ---- Checkbox ---- */
	.history-list__checkbox {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
	.history-list__checkbox input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	/* ---- Selected state ---- */
	.history-list__item--selected {
		background: var(--accent-soft);
	}

	/* ---- Action buttons (inside header in selection mode) ---- */
	.history-list__action-btn {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: background var(--transition-fast);
		white-space: nowrap;
	}
	.history-list__action-btn--delete {
		background: var(--danger-bg, #3b1c1c);
		color: var(--danger-text, #f87171);
	}
	.history-list__action-btn--delete:hover {
		background: var(--danger-hover, #4c2020);
	}
	.history-list__action-btn--reset {
		background: var(--bg-raised);
		color: var(--text-secondary);
		border: 1px solid var(--border);
	}
	.history-list__action-btn--reset:hover {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}
</style>
