<script lang="ts">
	// tablero de objetivos de robo. con la liga entera en el multiplicador por defecto
	// lo que discrimina no es el ratio sino qué cláusula cabe en el presupuesto.
	import { api, type StealTarget, type ManagerRow } from '$lib/api';
	import { money } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import PositionTag from '$lib/components/PositionTag.svelte';

	let targets = $state<StealTarget[]>([]);
	let self = $state<ManagerRow | null>(null);
	let selfLoaded = $state(false);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let useBudget = $state(true);
	let excludeOwn = $state(true);
	let hideShielded = $state(false);

	// el ledger se pide una sola vez: los filtros no lo cambian
	$effect(() => {
		api
			.ledger()
			.then((data) => {
				self = data.managers.find((m) => m.isSelf) ?? null;
				selfLoaded = true;
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	});

	// cada cambio de filtro relanza solo la consulta de cláusulas
	$effect(() => {
		const filters = { useBudget, excludeOwn, hideShielded };
		// con presupuesto activo hay que esperar a conocer el techo de puja
		if (filters.useBudget && !selfLoaded) return;
		loading = true;

		api
			.clauses({
				budget: filters.useBudget && self ? self.maxBid : undefined,
				excludeOwn: filters.excludeOwn,
				hideShielded: filters.hideShielded,
				limit: 80,
			})
			.then((data) => {
				targets = data.targets;
				loading = false;
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	});

	const affordable = $derived(targets.filter((t) => t.affordable).length);
</script>

<h1>cláusulas</h1>

<div class="filters">
	<label><input type="checkbox" bind:checked={useBudget} /> solo lo que puedo pagar</label>
	<label><input type="checkbox" bind:checked={excludeOwn} /> ocultar los míos</label>
	<label><input type="checkbox" bind:checked={hideShielded} /> ocultar blindados</label>
	{#if self && useBudget}
		<span class="budget">presupuesto {money(self.maxBid)} · {affordable} asequibles</span>
	{/if}
</div>

{#if loading}
	<p class="muted">cargando…</p>
{:else if error}
	<p class="error">no se pudo cargar: {error}</p>
{:else}
	<table class="data-table">
		<thead>
			<tr>
				<th>jugador</th>
				<th>pos</th>
				<th>dueño</th>
				<th class="num">valor</th>
				<th class="num">cláusula</th>
				<th class="num">ratio</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each targets as t (t.playerId)}
				<tr class:own={t.isOwn} class:affordable={t.affordable}>
					<td><a href="/players/{t.playerId}">{t.name}</a></td>
					<td><PositionTag position={t.position} /></td>
					<td class="muted">{t.ownerName}</td>
					<td class="num">{money(t.value)}</td>
					<td class="num strong">{money(t.clause)}</td>
					<td class="num" class:floor={t.atFloor}>{t.atFloor ? 'suelo' : t.ratio.toFixed(2)}</td>
					<td class="flags">
						{#if t.shielded}<Chip c="var(--warning)" variant="tint">blindado</Chip>{/if}
						{#if t.listed}<Chip variant="tint">en venta</Chip>{/if}
						{#if t.isOwn}<Chip c="var(--warning)" variant="glass">tuyo</Chip>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="note">
		los jugadores marcados como «suelo» tienen la cláusula mínima de 1M: su ratio alto es un
		artefacto del suelo, no una señal de que estén protegidos.
	</p>
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-4);
		align-items: center;
		margin-bottom: var(--sp-4);
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.filters label {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		cursor: pointer;
	}
	.budget {
		margin-left: auto;
		color: var(--accent);
	}
	.floor {
		color: var(--text-muted);
		font-size: 0.75rem;
	}
	tr.affordable td.strong {
		color: var(--accent);
	}
	tr.own td {
		background: color-mix(in srgb, var(--warning) 7%, transparent);
	}
	.flags {
		display: flex;
		gap: var(--sp-1);
	}
</style>
