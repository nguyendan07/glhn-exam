<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Thi trực tuyến</title>
</svelte:head>

<main>
	{@render children()}
</main>

<style>
	:global {
		:root {
			--bg: #f6f7f9;
			--card: #fff;
			--text: #1c2330;
			--muted: #5d6675;
			--line: #d8dce3;
			--primary: #1f5fbf;
			--primary-text: #fff;
			--ok: #1d7a46;
			--warn: #a25b00;
			--danger: #b3261e;
			color-scheme: light dark;
		}
		@media (prefers-color-scheme: dark) {
			:root {
				--bg: #12151b;
				--card: #1b2029;
				--text: #e6e9ef;
				--muted: #9aa3b2;
				--line: #333b48;
				--primary: #6a9ef0;
				--primary-text: #0d1320;
				--ok: #5cc68b;
				--warn: #e7a54a;
				--danger: #f08a82;
			}
		}
		* {
			box-sizing: border-box;
		}
		body {
			margin: 0;
			background: var(--bg);
			color: var(--text);
			font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		}
		h1 {
			font-size: 1.4rem;
			margin: 0 0 1rem;
		}
		.card {
			background: var(--card);
			border: 1px solid var(--line);
			border-radius: 12px;
			padding: 1rem;
		}
		label {
			display: block;
			font-weight: 600;
		}
		input[type='text'],
		textarea {
			width: 100%;
			font: inherit;
			padding: 0.65rem 0.75rem;
			border: 1px solid var(--line);
			border-radius: 8px;
			background: var(--card);
			color: var(--text);
		}
		button {
			font: inherit;
			padding: 0.65rem 1.1rem;
			border-radius: 8px;
			border: 1px solid var(--line);
			background: var(--card);
			color: var(--text);
			cursor: pointer;
			min-height: 44px;
		}
		button.primary {
			background: var(--primary);
			color: var(--primary-text);
			border-color: var(--primary);
			font-weight: 600;
		}
		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		:focus-visible {
			outline: 3px solid var(--primary);
			outline-offset: 2px;
		}
		.hint {
			color: var(--muted);
			font-size: 0.9rem;
			margin: 0.15rem 0 0.4rem;
		}
		.error {
			color: var(--danger);
		}
	}
	main {
		max-width: 680px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
