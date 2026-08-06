<script lang="ts">
	import '@platform/ui/base.css';
	import '../lib/styles/tokens.css';
	import { page } from '$app/state';

	let { children } = $props();

	const nav = [
		{ href: '/', label: 'liga' },
		{ href: '/clauses', label: 'cláusulas' },
		{ href: '/activity', label: 'actividad' },
	];
</script>

<div class="shell">
	<header>
		<span class="brand">fantasy</span>
		<nav>
			{#each nav as item (item.href)}
				<a href={item.href} class:active={page.url.pathname === item.href}>{item.label}</a>
			{/each}
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
		background: var(--fantasy-bg);
		color: var(--fantasy-text);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--fantasy-border);
		position: sticky;
		top: 0;
		background: var(--fantasy-bg);
		z-index: 10;
	}
	.brand {
		font-weight: 600;
		color: var(--fantasy-accent);
	}
	nav {
		display: flex;
		gap: 1rem;
	}
	nav a {
		color: var(--fantasy-muted);
		text-decoration: none;
		font-size: 0.9rem;
	}
	nav a.active,
	nav a:hover {
		color: var(--fantasy-text);
	}
	main {
		padding: 1rem;
		max-width: 1100px;
		margin: 0 auto;
	}
</style>
