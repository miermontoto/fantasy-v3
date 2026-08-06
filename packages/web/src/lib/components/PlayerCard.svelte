<script lang="ts">
	// tarjeta de jugador con la anatomía de v1: raíl de posición y puntos, foto,
	// nombre con valor y tendencia, racha con escala de calor y cláusula. sin
	// escudo de equipo ni próximo rival porque v3 no scrapea esos datos.
	import type { ActivityActor, RosterPlayer } from '$lib/api';
	import { money } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import ManagerTag from '$lib/components/ManagerTag.svelte';
	import PositionTag from '$lib/components/PositionTag.svelte';
	import Trend from '$lib/components/Trend.svelte';

	interface Props {
		player: RosterPlayer;
		/** presupuesto con el que comparar la cláusula; null = no marcar */
		budget?: number | null;
		/** dueño a mostrar; solo hace falta cuando la lista mezcla plantillas */
		owner?: ActivityActor | null;
	}
	let { player, budget = null, owner = null }: Props = $props();
	let photoBroken = $state(false);

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
	// lesión y roja son baja segura (danger); duda y 4 amarillas, aviso (warning)
	const STATUS_COLOR: Record<string, string> = {
		injury: 'var(--danger)',
		red: 'var(--danger)',
		doubt: 'var(--warning)',
		five: 'var(--warning)',
	};

	// escala de calor de v1: <0 rojo, 0 gris, 1-4 amarillo, 5-9 verde, ≥10 cian
	function heatBucket(pts: number | null): string {
		if (pts === null || pts === 0) return 'zero';
		if (pts < 0) return 'neg';
		if (pts < 5) return 'low';
		if (pts < 10) return 'mid';
		return 'high';
	}
</script>

<article class="row" class:stealable class:listed={player.listed}>
	<div class="rail">
		<PositionTag position={player.position} />
		<Chip c="var(--text)" variant="solid" title="puntos de la temporada">{player.points}</Chip>
	</div>

	{#if player.photoUrl && !photoBroken}
		<img
			class="photo"
			src={player.photoUrl}
			alt=""
			loading="lazy"
			onerror={() => (photoBroken = true)}
		/>
	{:else}
		<div class="photo placeholder">?</div>
	{/if}

	<div class="center">
		<div class="head">
			<a class="name" href="/players/{player.playerId}">{player.name}</a>
			{#if owner}<ManagerTag actor={owner} />{/if}
		</div>
		<div class="line">
			<span class="data-val">{money(player.value)}</span>
			<!-- la flecha sola no dice cuánto: pegada a la media se leía como si el
			     cambio fuese el valor de al lado. siempre con su delta -->
			{#if trend !== 0}<Trend value={trend} showDelta />{/if}
			<!-- en pretemporada la media es 0.0 para todos y solo añade ruido -->
			{#if player.average > 0}
				<span class="avg" title="media de puntos por jornada">{player.average.toFixed(1)}</span>
			{/if}
			{#if player.status}
				<Chip c={STATUS_COLOR[player.status] ?? 'var(--warning)'} variant="tint">
					{STATUS_LABEL[player.status] ?? player.status}
				</Chip>
			{/if}
		</div>
	</div>

	<div class="streak" title="puntos de las últimas jornadas">
		{#each player.streak.slice(-5) as pts, i (i)}
			<Chip c="var(--heat-{heatBucket(pts)})" variant="solid">{pts ?? '·'}</Chip>
		{/each}
	</div>

	<div class="clause">
		{#if player.listed}<Chip c="var(--warning)" variant="tint">en venta</Chip>{/if}
		<span
			class="data-val"
			title={player.shield !== 0 ? 'blindado: la cláusula no se puede pagar' : 'cláusula'}
		>
			{player.clause ? money(player.clause) : '—'}
		</span>
		{#if player.shield !== 0}<span class="shield">⛨</span>{/if}
	</div>
</article>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--sp-2) var(--sp-3);
		margin-bottom: 2px;
		font-size: 0.85rem;
		transition: border-color 0.05s;
	}
	.row:hover {
		border-color: var(--accent);
	}
	.row.stealable {
		background: color-mix(in srgb, var(--accent) 7%, var(--bg-card));
	}
	/* estado por anillo, como en v1: en venta = aviso del dueño */
	.row.listed {
		box-shadow: inset 0 0 0 1px var(--warning);
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rail :global(.chip) {
		min-width: 34px;
	}
	.photo {
		width: 40px;
		height: 48px;
		object-fit: cover;
		border-radius: var(--radius);
		background: var(--bg-hover);
		flex-shrink: 0;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-faint);
	}
	.center {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}
	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.line {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.avg {
		font-size: 0.7rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.streak {
		display: flex;
		gap: 2px;
	}
	.streak :global(.chip) {
		min-width: 1.4rem;
		padding: 0 2px;
		font-size: 0.6rem;
	}
	.clause {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		justify-content: flex-end;
		min-width: 4.5rem;
	}
	.shield {
		color: var(--warning);
	}

	/* densidad móvil: la racha es lo primero que cede */
	@media (max-width: 480px) {
		.streak {
			display: none;
		}
	}
</style>
