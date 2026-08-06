<script lang="ts">
	// índice de plantillas: entrada al visor. la propia primero.
	import { api, type ManagerInfo } from '$lib/api';

	let managers = $state<ManagerInfo[]>([]);
	let error = $state<string | null>(null);

	$effect(() => {
		api
			.managers()
			.then((d) => (managers = [...d.managers].sort((a, b) => Number(b.isSelf) - Number(a.isSelf))))
			.catch((err: Error) => (error = err.message));
	});
</script>

<h1>plantillas</h1>

{#if error}<p class="error">{error}</p>{/if}

<ul>
	{#each managers as m (m.id)}
		<li><a href="/managers/{m.id}">{m.name}</a>{#if m.isSelf}<span class="tag">tú</span>{/if}</li>
	{/each}
</ul>

<style>
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 1rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	a {
		color: var(--text);
		text-decoration: none;
	}
	a:hover {
		color: var(--accent);
	}
	.tag {
		font-size: 0.65rem;
		color: var(--accent);
		border: 1px solid var(--accent);
		padding: 0 0.25rem;
		border-radius: var(--radius);
	}
	.error {
		color: var(--danger);
	}
</style>
