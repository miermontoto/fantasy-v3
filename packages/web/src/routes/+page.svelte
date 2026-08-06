<script lang="ts">
	// tabla de la liga: cash estimado y poder de puja, que es el ranking de amenaza
	// real (quién puede pagar qué), no la clasificación por puntos.
	import { api, type ManagerRow } from '$lib/api';
	import { money, relativeTime } from '$lib/format';
	import Sparkline from '$lib/Sparkline.svelte';

	let managers = $state<ManagerRow[]>([]);
	let history = $state<Record<string, number[]>>({});
	let error = $state<string | null>(null);
	let loading = $state(true);

	$effect(() => {
		api
			.ledger()
			.then(async (data) => {
				managers = data.managers;
				loading = false;
				// las series se piden después: la tabla no debe esperar por los sparklines
				const series = await Promise.all(
					data.managers.map((m) =>
						api
							.managerHistory(m.managerId, 14)
							.then((h) => [m.managerId, h.history.map((p) => p.maxBid)] as const)
							.catch(() => [m.managerId, []] as const),
					),
				);
				history = Object.fromEntries(series);
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	});

	const self = $derived(managers.find((m) => m.isSelf));
	const rivalsAbove = $derived(self ? managers.filter((m) => !m.isSelf && m.maxBid > self.maxBid).length : 0);
</script>

<h1>liga</h1>

{#if loading}
	<p class="muted">cargando…</p>
{:else if error}
	<p class="error">no se pudo cargar: {error}</p>
{:else}
	{#if self}
		<section class="summary">
			<div>
				<span class="label">tu saldo</span>
				<span class="figure" class:down={self.cash < 0}>{money(self.cash)}</span>
			</div>
			<div>
				<span class="label">tu techo de puja</span>
				<span class="figure">{money(self.maxBid)}</span>
			</div>
			{#if self.remainingNow !== null}
				<div>
					<span class="label">disponible ahora</span>
					<span class="figure" title="descuenta la deuda y las pujas comprometidas"
						>{money(self.remainingNow)}</span
					>
				</div>
			{/if}
			<div>
				<span class="label">rivales por encima</span>
				<span class="figure">{rivalsAbove}</span>
			</div>
			<div>
				<span class="label">actualizado</span>
				<span class="figure small">{relativeTime(self.ts)}</span>
			</div>
		</section>
	{/if}

	<table>
		<thead>
			<tr>
				<th>mánager</th>
				<th class="num">saldo</th>
				<th class="num">plantilla</th>
				<th class="num">techo de puja</th>
				<th class="num">cláusulas</th>
				<th>14 d</th>
			</tr>
		</thead>
		<tbody>
			{#each managers as m (m.managerId)}
				<tr class:self={m.isSelf}>
					<td>
						{m.name}
						{#if m.exact}<span class="tag" title="calibrado con el saldo real">exacto</span>{/if}
					</td>
					<td class="num" class:down={m.cash < 0}>{money(m.cash)}</td>
					<td class="num">{money(m.teamValue)}</td>
					<td class="num strong">{money(m.maxBid)}</td>
					<td class="num muted">{m.clauseSpend > 0 ? money(m.clauseSpend) : '—'}</td>
					<td><Sparkline points={history[m.managerId] ?? []} /></td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="note">
		el saldo de los rivales es estimado a partir del baseline del reset y de los traspasos
		observados. la fila propia sale del saldo real. el techo de puja es el saldo más la deuda
		permitida (25% de la plantilla), acotado en cero: con deuda suficiente no se puede comprar.
		«disponible ahora» descuenta además las pujas ya comprometidas.
	</p>
{/if}

<style>
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 1rem;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fantasy-border);
		background: var(--fantasy-surface);
		margin-bottom: 1rem;
	}
	.summary div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fantasy-muted);
	}
	.figure {
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
	}
	.figure.small {
		font-size: 0.9rem;
		color: var(--fantasy-muted);
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
		color: var(--fantasy-muted);
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--fantasy-border);
	}
	td {
		padding: 0.45rem 0.5rem;
		border-bottom: 1px solid var(--fantasy-border);
		font-variant-numeric: tabular-nums;
	}
	.num {
		text-align: right;
	}
	.strong {
		font-weight: 600;
	}
	tr.self td {
		background: color-mix(in srgb, var(--fantasy-accent) 8%, transparent);
	}
	.down {
		color: var(--fantasy-down);
	}
	.muted {
		color: var(--fantasy-muted);
	}
	.tag {
		font-size: 0.65rem;
		color: var(--fantasy-accent);
		border: 1px solid var(--fantasy-accent);
		padding: 0 0.25rem;
		margin-left: 0.35rem;
		border-radius: var(--radius);
	}
	.note {
		margin-top: 1rem;
		font-size: 0.75rem;
		color: var(--fantasy-muted);
		max-width: 60ch;
	}
	.error {
		color: var(--fantasy-down);
	}
</style>
