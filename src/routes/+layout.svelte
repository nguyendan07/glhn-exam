<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Thi trực tuyến</title>
</svelte:head>

<main class="mx-auto w-full max-w-5xl p-4 md:p-6">
	{@render children()}
</main>
