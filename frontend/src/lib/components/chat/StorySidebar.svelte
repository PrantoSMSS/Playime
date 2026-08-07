<script lang="ts">
	import { activeSession } from '$lib/state/chat.svelte';
	import type { QuestEntry } from '$lib/types/chat';

	const session = $derived(activeSession());

	const quests = $derived(session?.questLogState ?? []);
	const plotFlags = $derived(session?.plotFlags ?? {});

	const activeQuest = $derived(quests.find((q) => q.status === 'active'));
	const pendingQuests = $derived(quests.filter((q) => q.status === 'pending'));
	const completedQuests = $derived(quests.filter((q) => q.status === 'completed'));
	const failedQuests = $derived(quests.filter((q) => q.status === 'failed'));

	function statusColor(status: QuestEntry['status']): string {
		switch (status) {
			case 'active': return 'var(--accent)';
			case 'completed': return 'var(--text-muted)';
			case 'failed': return 'var(--color-error, #ef4444)';
			default: return 'var(--text-muted)';
		}
	}

	function statusIcon(status: QuestEntry['status']): string {
		switch (status) {
			case 'active': return '◆'; // diamond
			case 'completed': return '✓'; // checkmark
			case 'failed': return '✗'; // x
			default: return '○'; // circle
		}
	}
</script>

<aside class="story-sidebar">
	<!-- Quest Log -->
	<section class="sidebar__section">
		<h3 class="sidebar__title">Quest Log</h3>
		{#if quests.length === 0}
			<p class="sidebar__empty">No quests yet</p>
		{:else}
			<div class="sidebar__quests">
				{#if activeQuest}
					<div class="sidebar__quest sidebar__quest--active">
						<span class="sidebar__quest-icon" style="color: {statusColor('active')}">{statusIcon('active')}</span>
						<div class="sidebar__quest-info">
							<span class="sidebar__quest-title">{activeQuest.title}</span>
							<span class="sidebar__quest-obj">{activeQuest.objective}</span>
						</div>
					</div>
				{/if}

				{#each pendingQuests as quest (quest.id)}
					<div class="sidebar__quest sidebar__quest--pending">
						<span class="sidebar__quest-icon" style="color: {statusColor('pending')}">{statusIcon('pending')}</span>
						<div class="sidebar__quest-info">
							<span class="sidebar__quest-title">{quest.title}</span>
						</div>
					</div>
				{/each}

				{#each completedQuests as quest (quest.id)}
					<div class="sidebar__quest sidebar__quest--completed">
						<span class="sidebar__quest-icon" style="color: {statusColor('completed')}">{statusIcon('completed')}</span>
						<div class="sidebar__quest-info">
							<span class="sidebar__quest-title">{quest.title}</span>
						</div>
					</div>
				{/each}

				{#each failedQuests as quest (quest.id)}
					<div class="sidebar__quest sidebar__quest--failed">
						<span class="sidebar__quest-icon" style="color: {statusColor('failed')}">{statusIcon('failed')}</span>
						<div class="sidebar__quest-info">
							<span class="sidebar__quest-title">{quest.title}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Plot Flags -->
	<section class="sidebar__section">
		<h3 class="sidebar__title">Story State</h3>
		{#if Object.keys(plotFlags).length === 0}
			<p class="sidebar__empty">No flags set yet</p>
		{:else}
			<div class="sidebar__flags">
				{#each Object.entries(plotFlags) as [key, value] (key)}
					<div class="sidebar__flag">
						<span class="sidebar__flag-key">{key}</span>
						<span class="sidebar__flag-val">{String(value)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</aside>

<style>
	.story-sidebar {
		width: 280px;
		flex-shrink: 0;
		height: 100%;
		overflow-y: auto;
		border-left: 1px solid var(--border);
		background: var(--bg-raised);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.sidebar__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.sidebar__title {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sidebar__empty {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		font-style: italic;
	}

	/* Quest list */
	.sidebar__quests {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.sidebar__quest {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
	}

	.sidebar__quest--active {
		background: var(--accent-soft);
		border: 1px solid var(--accent-muted);
	}

	.sidebar__quest--completed,
	.sidebar__quest--failed {
		opacity: 0.6;
	}

	.sidebar__quest-icon {
		flex-shrink: 0;
		font-size: var(--font-size-sm);
		line-height: 1.4;
	}

	.sidebar__quest-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.sidebar__quest-title {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sidebar__quest--completed .sidebar__quest-title,
	.sidebar__quest--failed .sidebar__quest-title {
		text-decoration: line-through;
	}

	.sidebar__quest-obj {
		font-size: 10px;
		color: var(--text-muted);
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Plot flags */
	.sidebar__flags {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.sidebar__flag {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-1) var(--space-2);
		background: var(--bg);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
	}

	.sidebar__flag-key {
		color: var(--text-secondary);
		font-weight: var(--font-weight-medium);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sidebar__flag-val {
		color: var(--text-muted);
		flex-shrink: 0;
		margin-left: var(--space-2);
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
