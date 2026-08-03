<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		initials,
		hue,
		size = 36,
		square = false,
		children
	}: {
		initials: string;
		hue: number;
		size?: number;
		square?: boolean;
		/** Optional slot for a real image; initials render by default. */
		children?: Snippet;
	} = $props();
</script>

<div
	class="avatar"
	class:avatar--square={square}
	style={`--avatar-h:${hue}; --avatar-size:${size}px`}
	aria-hidden="true"
>
	{#if children}
		{@render children()}
	{:else}
		{initials}
	{/if}
</div>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--avatar-size);
		height: var(--avatar-size);
		flex-shrink: 0;
		border-radius: 50%;
		background: linear-gradient(
			145deg,
			hsl(var(--avatar-h) 55% 26%) 0%,
			hsl(var(--avatar-h) 60% 15%) 100%
		);
		border: 1px solid hsl(var(--avatar-h) 45% 32%);
		color: hsl(var(--avatar-h) 60% 88%);
		font-size: calc(var(--avatar-size) * 0.34);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.02em;
		user-select: none;
		overflow: hidden;
	}

	.avatar--square {
		border-radius: var(--radius-sm);
	}

	.avatar :global(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
