<script lang="ts">
	// visor de plantilla: la propia y la de cualquier rival, con la tarjeta de v1.
	// mirar la plantilla de un rival es cómo se localizan objetivos de cláusula.
	import { api, type RosterPlayer, type ManagerInfo, type ManagerRow } from '$lib/api';
	import { money, position } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import PlayerCard from '$lib/components/PlayerCard.svelte';
	import { page } from '$app/state';

	let players = $state<RosterPlayer[]>([]);
	let managers = $state<ManagerInfo[]>([]);
	let self = $state<ManagerRow | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);

	// filtro de posición como en v1: sin selección = todas
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

<h1>
	{current?.name ?? 'plantilla'}
	{#if current?.isSelf}<Chip c="var(--accent)" variant="tint">tú</Chip>{/if}
</h1>

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
				<button
					style:--c={`var(--pos-${pos})`}
					class:on={positions.has(pos)}
					onclick={() => togglePosition(pos)}
				>
					<span>{position(pos)}</span>
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
		<span class="totals">
			{filtered.length} jug. · {money(totals.value)} · cláusulas {money(totals.clause)}
		</span>
	</div>

	<div class="list">
		{#each filtered as player (player.playerId)}
			<PlayerCard {player} budget={current?.isSelf ? null : budget} />
		{:else}
			<p class="empty">sin jugadores que cumplan el filtro</p>
		{/each}
	</div>
{/if}

<style>
	h1 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.managers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin-bottom: var(--sp-4);
	}
	.managers a {
		font-size: 0.75rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.15rem var(--sp-2);
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
		gap: var(--sp-3);
		margin-bottom: var(--sp-2);
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.filters label {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		cursor: pointer;
	}
	.positions {
		display: flex;
		gap: var(--sp-1);
	}
	/* botones de posición con el skew de v1: apagados en contorno, encendidos
	   en sólido del color de la posición */
	.positions button {
		transform: skewX(var(--skew));
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px var(--sp-3);
		color: var(--c);
		opacity: 0.45;
	}
	.positions button span {
		display: block;
		transform: skewX(var(--unskew));
	}
	.positions button:hover {
		opacity: 0.8;
		background: transparent;
		border-color: var(--c);
	}
	.positions button.on {
		opacity: 1;
		background: var(--c);
		border-color: var(--c);
		color: var(--on-accent);
	}
	.totals {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}
</style>
