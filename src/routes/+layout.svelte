<script lang="ts">
	import './layout.css';
	import logo from '#lib/assets/gpthaibinh90years.webp';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/webp" href={logo} />
	<title>Thi trực tuyến</title>
</svelte:head>

<main class="mx-auto w-full max-w-5xl p-4 md:p-6">
	{@render children()}
</main>
