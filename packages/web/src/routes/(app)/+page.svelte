<script lang="ts">
	// tabla de la liga: cash estimado y poder de puja, que es el ranking de amenaza
	// real (quién puede pagar qué), no la clasificación por puntos.
	import { api, type ManagerRow } from '$lib/api';
	import { money, relativeTime } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';

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
		<section class="stats-grid">
			<div class="stat-card">
				<span class="stat-value" class:negative={self.cash < 0}>{money(self.cash)}</span>
				<span class="stat-label">tu saldo</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{money(self.maxBid)}</span>
				<span class="stat-label">tu techo de puja</span>
			</div>
			{#if self.remainingNow !== null}
				<div class="stat-card" title="descuenta la deuda y las pujas comprometidas">
					<span class="stat-value">{money(self.remainingNow)}</span>
					<span class="stat-label">disponible ahora</span>
				</div>
			{/if}
			<div class="stat-card">
				<span class="stat-value">{rivalsAbove}</span>
				<span class="stat-label">rivales por encima</span>
			</div>
			<div class="stat-card">
				<span class="stat-value quiet">{relativeTime(self.ts)}</span>
				<span class="stat-label">actualizado</span>
			</div>
		</section>
	{/if}

	<table class="data-table">
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
					<td class="manager">
						{m.name}
						{#if m.exact}
							<Chip c="var(--accent)" variant="tint" title="calibrado con el saldo real">exacto</Chip>
						{/if}
					</td>
					<td class="num" class:negative={m.cash < 0}>{money(m.cash)}</td>
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
	.stat-value.quiet {
		font-size: 0.85rem;
		color: var(--text-muted);
		align-self: flex-start;
		line-height: 1.8;
	}
	.stat-value.negative,
	td.negative {
		color: var(--danger);
	}
	.manager {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	tr.self td {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}
</style>
