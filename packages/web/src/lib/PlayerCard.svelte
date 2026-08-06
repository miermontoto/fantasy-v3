<script lang="ts">
	// tarjeta densa de jugador, heredada del diseño de v1: en una línea caben
	// posición, nombre, aviso de estado, valor con tendencia, racha y cláusula.
	import type { RosterPlayer } from '$lib/api';
	import { money, position, trendClass } from '$lib/format';

	interface Props {
		player: RosterPlayer;
		/** presupuesto con el que comparar la cláusula; null = no marcar */
		budget?: number | null;
	}
	let { player, budget = null }: Props = $props();

	const trend = $derived(player.prevValue ? player.value - player.prevValue : 0);
	const stealable = $derived(
		budget !== null && player.clause !== null && player.shield === 0 && player.clause <= budget,
	);

	const STATUS_LABEL: Record<string, string> = {
		injury: 'lesionado',
		doubt: 'duda',
		red: 'roja',
		five: 'sanción',
	};
</script>

<article class="card" class:stealable>
	<span class="pos pos-{player.position}">{position(player.position)}</span>

	<a class="name" href="/players/{player.playerId}">{player.name}</a>

	{#if player.status}
		<span class="status status-{player.status}">{STATUS_LABEL[player.status] ?? player.status}</span>
	{/if}

	<div class="streak" title="puntos de las últimas jornadas">
		{#each player.streak.slice(-5) as pts, i (i)}
			<span class="pip" class:none={pts === null} class:good={pts !== null && pts >= 6}>
				{pts ?? '·'}
			</span>
		{/each}
	</div>

	<span class="value">
		{money(player.value)}
		{#if trend !== 0}<span class="trend {trendClass(trend)}">{trend > 0 ? '▲' : '▼'}</span>{/if}
	</span>

	<span class="clause" title={player.shield ? 'blindado: la cláusula no se puede pagar' : 'cláusula'}>
		{player.clause ? money(player.clause) : '—'}
		{#if player.shield !== 0}<span class="shield">⛨</span>{/if}
	</span>

	{#if player.listed}<span class="tag">en venta</span>{/if}
</article>

<style>
	.card {
		display: grid;
		grid-template-columns: 2.2rem minmax(6rem, 1fr) auto auto 5.5rem 6rem auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--fantasy-border);
		font-size: 0.85rem;
	}
	.card.stealable {
		background: color-mix(in srgb, var(--fantasy-accent) 7%, transparent);
	}
	.pos {
		font-size: 0.7rem;
		font-weight: 600;
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
	.name {
		color: var(--fantasy-text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name:hover {
		color: var(--fantasy-accent);
	}
	.status {
		font-size: 0.65rem;
		padding: 0 0.25rem;
		border-radius: var(--radius);
		border: 1px solid currentColor;
		color: var(--fantasy-warn);
	}
	.status-injury,
	.status-red {
		color: var(--fantasy-down);
	}
	.streak {
		display: flex;
		gap: 2px;
	}
	.pip {
		min-width: 1.1rem;
		text-align: center;
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		background: var(--fantasy-surface);
		border: 1px solid var(--fantasy-border);
		border-radius: var(--radius);
	}
	.pip.none {
		color: var(--fantasy-muted);
	}
	.pip.good {
		color: var(--fantasy-up);
		border-color: var(--fantasy-up);
	}
	.value,
	.clause {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.trend.up {
		color: var(--fantasy-up);
	}
	.trend.down {
		color: var(--fantasy-down);
	}
	.shield {
		color: var(--fantasy-warn);
	}
	.tag {
		font-size: 0.65rem;
		color: var(--fantasy-muted);
		border: 1px solid var(--fantasy-border);
		padding: 0 0.25rem;
		border-radius: var(--radius);
	}
</style>
