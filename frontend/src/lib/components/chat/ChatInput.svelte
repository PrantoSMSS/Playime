<script lang="ts">
	import Icon from './Icon.svelte';

	let { onSend }: { onSend?: (text: string) => void } = $props();

	let text = $state('');

	function submit(e: SubmitEvent): void {
		e.preventDefault();
		const value = text.trim();
		if (!value) return;
		onSend?.(value);
		text = '';
	}
</script>

<form class="chat-input" onsubmit={submit}>
	<button type="button" class="chat-input__icon" title="Attach">
		<Icon name="plus" size={18} />
	</button>
	<button type="button" class="chat-input__icon" title="Sticker">
		<Icon name="smile" size={18} />
	</button>

	<input
		class="chat-input__field"
		type="text"
		placeholder="Send Message"
		autocomplete="off"
		bind:value={text}
		aria-label="Message"
	/>

	<button
		type="submit"
		class="chat-input__send"
		title="Send"
		aria-label="Send"
		disabled={!text.trim()}
	>
		<Icon name="send" size={17} />
	</button>
</form>

<style>
	.chat-input {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		background: var(--surface-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		transition: border-color var(--transition-fast);
	}
	.chat-input:focus-within {
		border-color: var(--accent-muted);
	}

	.chat-input__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: 50%;
		color: var(--icon);
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.chat-input__icon:hover {
		background: var(--accent-soft);
		color: var(--icon-hover);
	}

	.chat-input__field {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		padding: var(--space-1) var(--space-2);
		color: var(--text);
		font-size: var(--font-size-base);
	}
	.chat-input__field::placeholder {
		color: var(--text-muted);
	}

	.chat-input__send {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		transition: background var(--transition-fast), transform var(--transition-fast);
	}
	.chat-input__send:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.chat-input__send:active:not(:disabled) {
		transform: scale(0.94);
	}
	.chat-input__send:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
