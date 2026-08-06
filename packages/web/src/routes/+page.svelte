<script lang="ts">
	// placeholder del scaffold: el dashboard real llega en la fase 3
	let version = $state<string | null>(null);

	$effect(() => {
		fetch('/api/health')
			.then((r) => r.json())
			.then((d) => (version = d.version))
			.catch(() => (version = null));
	});
</script>

<main>
	<h1>fantasy</h1>
	<p>api: {version ?? '...'}</p>
</main>

<style>
	main {
		padding: 2rem;
		color: var(--fantasy-text);
		background: var(--fantasy-bg);
		min-height: 100vh;
	}
</style>
