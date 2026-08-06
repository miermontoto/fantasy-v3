<script lang="ts">
	// visor de plantilla: la propia y la de cualquier rival, con la tarjeta de v1.
	// mirar la plantilla de un rival es cómo se localizan objetivos de cláusula.
	import { api, type RosterPlayer, type ManagerInfo, type ManagerRow } from '$lib/api';
	import { money, position } from '$lib/format';
	import PlayerCard from '$lib/PlayerCard.svelte';
	import { page } from '$app/state';

	let players = $state<RosterPlayer[]>([]);
	let managers = $state<ManagerInfo[]>([]);
	let self = $state<ManagerRow | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);

	// filtro de posición tri-estado como en v1: sin selección = todas
	let positions = $state<Set<number>>(new Set());
	let search = $state('');
	let onlyStealable = $state(false);

	$effect(() => {
		const id = page.params.id;
		if (!id) return;
		loading = true;
		Promise.all([api.roster(id), api.managers(), api.ledger()])
			.then(([r, m, l]) => {
				players = r.players;
				managers = m.managers;
				self = l.managers.find((x) => x.isSelf) ?? null;
				loading = false;
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	});

	const current = $derived(managers.find((m) => m.id === page.params.id));
	const budget = $derived(self?.maxBid ?? null);

	function togglePosition(pos: number) {
		const next = new Set(positions);
		if (next.has(pos)) next.delete(pos);
		else next.add(pos);
		positions = next;
	}

	const filtered = $derived(
		players.filter((p) => {
			if (positions.size > 0 && !positions.has(p.position)) return false;
			if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
			if (onlyStealable) {
				if (p.shield !== 0 || p.clause === null) return false;
				if (budget === null || p.clause > budget) return false;
			}
			return true;
		}),
	);

	const totals = $derived({
		value: filtered.reduce((sum, p) => sum + p.value, 0),
		clause: filtered.reduce((sum, p) => sum + (p.clause ?? 0), 0),
	});
</script>

<h1>{current?.name ?? 'plantilla'}{#if current?.isSelf}<span class="tag">tú</span>{/if}</h1>

<nav class="managers">
	{#each managers as m (m.id)}
		<a href="/managers/{m.id}" class:active={m.id === page.params.id}>{m.name}</a>
	{/each}
</nav>

{#if loading}
	<p class="muted">cargando…</p>
{:else if error}
	<p class="error">no se pudo cargar: {error}</p>
{:else}
	<div class="filters">
		<div class="positions">
			{#each [1, 2, 3, 4] as pos (pos)}
				<button class="pos pos-{pos}" class:on={positions.has(pos)} onclick={() => togglePosition(pos)}>
					{position(pos)}
				</button>
			{/each}
		</div>
		<input type="search" placeholder="buscar jugador" bind:value={search} />
		{#if !current?.isSelf && budget !== null}
			<label>
				<input type="checkbox" bind:checked={onlyStealable} />
				solo robables con {money(budget)}
			</label>
		{/if}
		<span class="totals">{filtered.length} jug. · {money(totals.value)} · cláusulas {money(totals.clause)}</span>
	</div>

	<div class="list">
		{#each filtered as player (player.playerId)}
			<PlayerCard {player} budget={current?.isSelf ? null : budget} />
		{:else}
			<p class="muted">sin jugadores que cumplan el filtro</p>
		{/each}
	</div>
{/if}

<style>
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.managers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.managers a {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-decoration: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.15rem 0.4rem;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.managers a.active,
	.managers a:hover {
		color: var(--text);
		border-color: var(--accent);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.filters label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
	}
	.positions {
		display: flex;
		gap: 0.25rem;
	}
	.positions button {
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.15rem 0.45rem;
		cursor: pointer;
		opacity: 0.5;
	}
	.positions button.on {
		opacity: 1;
		border-color: currentColor;
	}
	.pos-1 {
		color: var(--pos-gk);
	}
	.pos-2 {
		color: var(--pos-def);
	}
	.pos-3 {
		color: var(--pos-mid);
	}
	.pos-4 {
		color: var(--pos-fwd);
	}
	input[type='search'] {
		font: inherit;
		font-size: 0.8rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		padding: 0.2rem 0.4rem;
	}
	.totals {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}
	.tag {
		font-size: 0.65rem;
		color: var(--accent);
		border: 1px solid var(--accent);
		padding: 0 0.25rem;
		border-radius: var(--radius);
	}
	.muted {
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
	}
</style>
