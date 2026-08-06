<script lang="ts">
	// pantalla de login: el flujo real ocurre en /api/auth/login (redirección a
	// id.mier.info). aquí solo el botón y el motivo del rechazo, si lo hubo.
	import { page } from '$app/state';

	const error = $derived(page.url.searchParams.get('error'));
</script>

<div class="wrap">
	<h1>fantasy</h1>
	<p class="sub">inteligencia de mercado de tu liga</p>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<a class="btn" href="/api/auth/login">entrar con mier.info</a>
</div>

<style>
	.wrap {
		max-width: 22rem;
		margin: 20vh auto 0;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h1 {
		font-size: 1.4rem;
		font-weight: 600;
		margin: 0;
		color: var(--accent);
	}
	.sub {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0 0 1rem;
	}
	.btn {
		display: block;
		padding: 0.6rem 1rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		color: var(--accent);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.btn:hover {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.error {
		color: var(--danger);
		font-size: 0.8rem;
		margin: 0;
	}
</style>
