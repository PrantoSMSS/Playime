<script lang="ts">
	import { ICONS } from './icons';
	import type { IconName } from './icons';

	let {
		name,
		size = 20,
		class: klass = ''
	}: { name: IconName; size?: number; class?: string } = $props();
</script>

<svg
	class={klass}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>{@html ICONS[name]}</svg>
