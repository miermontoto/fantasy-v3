<script lang="ts">
	// tablero de objetivos de robo. con la liga entera en el multiplicador por defecto
	// lo que discrimina no es el ratio sino qué cláusula cabe en el presupuesto.
	import { api, type StealTarget, type ManagerRow } from '$lib/api';
	import { money, position } from '$lib/format';

	let targets = $state<StealTarget[]>([]);
	let self = $state<ManagerRow | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let useBudget = $state(true);
	let excludeOwn = $state(true);
	let hideShielded = $state(false);

	$effect(() => {
		// dependencias explícitas para que el efecto reaccione a los filtros
		const filters = { useBudget, excludeOwn, hideShielded };
		loading = true;

		api
			.ledger()
			.then((data) => {
				const me = data.managers.find((m) => m.isSelf) ?? null;
				self = me;
				return api.clauses({
					budget: filters.useBudget && me ? me.maxBid : undefined,
					excludeOwn: filters.excludeOwn,
					hideShielded: filters.hideShielded,
					limit: 80,
				});
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
	<table>
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
					<td class="pos pos-{t.position}">{position(t.position)}</td>
					<td class="muted">{t.ownerName}</td>
					<td class="num">{money(t.value)}</td>
					<td class="num strong">{money(t.clause)}</td>
					<td class="num" class:floor={t.atFloor}>{t.atFloor ? 'suelo' : t.ratio.toFixed(2)}</td>
					<td class="flags">
						{#if t.shielded}<span class="tag warn">blindado</span>{/if}
						{#if t.listed}<span class="tag">en venta</span>{/if}
						{#if t.isOwn}<span class="tag own">tuyo</span>{/if}
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
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 1rem;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.filters label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.budget {
		margin-left: auto;
		color: var(--accent);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}
	th {
		text-align: left;
		font-weight: 500;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
		font-variant-numeric: tabular-nums;
	}
	td a {
		color: var(--text);
		text-decoration: none;
	}
	td a:hover {
		color: var(--accent);
	}
	.num {
		text-align: right;
	}
	.strong {
		font-weight: 600;
	}
	.muted {
		color: var(--text-muted);
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
	.flags {
		display: flex;
		gap: 0.25rem;
	}
	.tag {
		font-size: 0.65rem;
		border: 1px solid var(--border);
		color: var(--text-muted);
		padding: 0 0.25rem;
		border-radius: var(--radius);
	}
	.tag.warn {
		color: var(--warning);
		border-color: var(--warning);
	}
	.tag.own {
		color: var(--warning);
	}
	.note {
		margin-top: 1rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		max-width: 60ch;
	}
	.error {
		color: var(--danger);
	}
</style>
