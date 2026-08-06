<script lang="ts">
	// la liga vista como contabilidad: cash estimado y poder de puja, que es el
	// ranking de amenaza real (quién puede pagar qué), no la clasificación por
	// puntos. cada rival es una tarjeta con la misma anatomía que la de jugador.
	import { api, type ManagerRow } from '$lib/api';
	import { money, relativeTime } from '$lib/format';
	import ManagerCard from '$lib/components/ManagerCard.svelte';

	const HISTORY_DAYS = 14;

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
				// las series se piden después: la lista no debe esperar por los sparklines
				const series = await Promise.all(
					data.managers.map((m) =>
						api
							.managerHistory(m.managerId, HISTORY_DAYS)
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
	const rivalsAbove = $derived(
		self ? managers.filter((m) => !m.isSelf && m.maxBid > self.maxBid).length : 0,
	);
	// lo que hace falta para adelantar al rival inmediatamente superior
	const gap = $derived.by(() => {
		if (!self) return null;
		const above = managers.filter((m) => !m.isSelf && m.maxBid > self.maxBid);
		if (above.length === 0) return null;
		return Math.min(...above.map((m) => m.maxBid)) - self.maxBid;
	});
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
			<div class="stat-card" title={gap === null ? 'nadie puede pagar más que tú' : 'para adelantar al siguiente'}>
				<span class="stat-value">{rivalsAbove}</span>
				<span class="stat-label">
					{#if gap === null}rivales por encima{:else}rivales por encima · +{money(gap)}{/if}
				</span>
			</div>
			<div class="stat-card">
				<span class="stat-value quiet">{relativeTime(self.ts)}</span>
				<span class="stat-label">actualizado</span>
			</div>
		</section>
	{/if}

	<div class="list">
		{#each managers as m, i (m.managerId)}
			<ManagerCard manager={m} rank={i + 1} history={history[m.managerId] ?? []} />
		{:else}
			<p class="empty">todavía no hay ningún mánager sincronizado</p>
		{/each}
	</div>

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
	.stat-value.negative {
		color: var(--danger);
	}
</style>
