<script lang="ts">
	// índice de plantillas: entrada al visor. la propia primero.
	import { api, type ManagerInfo } from '$lib/api';
	import Chip from '$lib/components/Chip.svelte';

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

<ul class="list">
	{#each managers as m (m.id)}
		<li>
			<a href="/managers/{m.id}">{m.name}</a>
			{#if m.isSelf}<Chip c="var(--accent)" variant="tint">tú</Chip>{/if}
		</li>
	{/each}
</ul>

<style>
	.list {
		list-style: none;
		max-width: 32rem;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 2px;
		transition: border-color 0.05s;
	}
	.list li:hover {
		border-color: var(--accent);
	}
	.list a {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
