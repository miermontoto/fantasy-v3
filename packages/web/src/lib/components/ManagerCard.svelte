<script lang="ts">
	// tarjeta de mánager: el hermano de PlayerCard para la otra entidad de la app.
	// misma anatomía (raíl a la izquierda, centro con nombre y cifras, racha y dato
	// fuerte a la derecha) para que liga y plantillas se lean con el mismo golpe de
	// vista. el raíl lleva el puesto por poder de puja, que es el ranking de amenaza
	// real, y al lado el de la clasificación por puntos, que casi nunca coincide.
	import type { ManagerRow } from '$lib/api';
	import { money } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';

	interface Props {
		manager: ManagerRow;
		/** puesto por poder de puja (1 = el que más puede pagar) */
		rank: number;
		/** serie de techo de puja para la sparkline; vacía mientras carga */
		history?: number[];
	}
	let { manager, rank, history = [] }: Props = $props();

	// el podio de amenaza se marca en accent; el resto queda apagado
	const PODIUM = 3;
</script>

<article class="row" class:self={manager.isSelf}>
	<div class="rail">
		<Chip c={rank <= PODIUM ? 'var(--accent)' : 'var(--text-faint)'} variant="solid" title="puesto por poder de puja">
			#{rank}
		</Chip>
		{#if manager.position !== null}
			<Chip variant="glass" title="puesto en la clasificación por puntos">{manager.position}º</Chip>
		{/if}
	</div>

	<div class="center">
		<div class="head">
			<a class="name" href="/managers/{manager.managerId}">{manager.name}</a>
			{#if manager.isSelf}<Chip c="var(--accent)" variant="tint">tú</Chip>{/if}
			{#if manager.exact}
				<Chip c="var(--accent)" variant="tint" title="calibrado con el saldo real, no estimado">exacto</Chip>
			{/if}
		</div>
		<div class="line">
			<span class="pair">
				<span class="k">saldo</span>
				<span class="data-val" class:negative={manager.cash < 0}>{money(manager.cash)}</span>
			</span>
			<span class="pair">
				<span class="k">plantilla</span>
				<span class="data-val">{money(manager.teamValue)}</span>
			</span>
			{#if manager.points !== null}
				<span class="pair">
					<span class="k">pts</span>
					<span class="data-val">{manager.points}</span>
				</span>
			{/if}
			{#if manager.clauseSpend > 0}
				<span class="pair" title="gasto estimado en subir cláusulas">
					<span class="k">cláusulas</span>
					<span class="data-val">{money(manager.clauseSpend)}</span>
				</span>
			{/if}
		</div>
	</div>

	<div class="spark" title="techo de puja de los últimos 14 días">
		<Sparkline points={history} />
	</div>

	<div class="bid">
		<span class="data-val big">{money(manager.maxBid)}</span>
		<span class="k">
			{#if manager.remainingNow !== null}
				{money(manager.remainingNow)} ahora
			{:else}
				techo de puja
			{/if}
		</span>
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
	.row.self {
		background: color-mix(in srgb, var(--accent) 7%, var(--bg-card));
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rail :global(.chip) {
		min-width: 34px;
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
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--sp-3);
	}
	.pair {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
	}
	.k {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.negative {
		color: var(--danger);
	}
	.bid {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		min-width: 6rem;
	}
	.big {
		font-size: 1rem;
		color: var(--accent);
	}

	/* densidad móvil: la sparkline es lo primero que cede, igual que la racha
	   en la tarjeta de jugador */
	@media (max-width: 480px) {
		.spark {
			display: none;
		}
	}
</style>
