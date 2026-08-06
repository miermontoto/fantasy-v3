<script lang="ts">
	// actividad de la liga en una sola línea temporal: traspasos y cambios de
	// cláusula mezclados por fecha, cada uno con quién lo hizo y la tarjeta del
	// jugador. arriba, el estado de los pollers, que es lo que garantiza que el
	// feed no se haya dejado nada por el camino.
	import { api, type ActivityEvent, type ManagerRow, type PollerRow } from '$lib/api';
	import { relativeTime } from '$lib/format';
	import EventCard from '$lib/components/EventCard.svelte';

	const LIMIT = 60;

	let events = $state<ActivityEvent[]>([]);
	let pollers = $state<PollerRow[]>([]);
	let self = $state<ManagerRow | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let syncing = $state<string | null>(null);
	let filter = $state<'all' | 'transfer' | 'clause'>('all');

	function load() {
		Promise.all([api.activity(LIMIT), api.pollers(), api.ledger()])
			.then(([a, p, l]) => {
				events = a.events;
				pollers = p.pollers;
				self = l.managers.find((m) => m.isSelf) ?? null;
				loading = false;
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	}

	$effect(load);

	async function runPoller(name: string) {
		syncing = name;
		try {
			await api.runPoller(name);
			load();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			syncing = null;
		}
	}

	const visible = $derived(events.filter((e) => filter === 'all' || e.group === filter));

	const DAY_MS = 86_400_000;

	/** distancia en días naturales al de hoy, no en múltiplos de 24 h */
	function dayLabel(ts: number): string {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const elapsed = Math.floor((start.getTime() - ts) / DAY_MS);
		if (elapsed < 0) return 'hoy';
		if (elapsed === 0) return 'ayer';
		return new Date(ts).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
	}

	// el feed se agrupa por día: sin cortes, una lista larga de «hace 3 h» no deja
	// ver dónde acaba lo de hoy y empieza lo de ayer
	const days = $derived.by(() => {
		const groups: { label: string; events: ActivityEvent[] }[] = [];
		for (const event of visible) {
			const label = dayLabel(event.ts);
			const last = groups.at(-1);
			if (last?.label === label) last.events.push(event);
			else groups.push({ label, events: [event] });
		}
		return groups;
	});
</script>

<h1>actividad</h1>

{#if error}<p class="error">{error}</p>{/if}

<section class="pollers">
	{#each pollers as p (p.name)}
		<button onclick={() => runPoller(p.name)} disabled={syncing === p.name} class:failing={p.failures > 0}>
			<span class="name">{p.name}</span>
			<span class="when">
				{syncing === p.name ? 'sincronizando…' : p.lastOkAt ? relativeTime(p.lastOkAt) : 'nunca'}
			</span>
			{#if p.failures > 0}<span class="fail">{p.failures} fallos</span>{/if}
		</button>
	{/each}
</section>

<div class="filters">
	<button class:on={filter === 'all'} onclick={() => (filter = 'all')}>todo</button>
	<button class:on={filter === 'transfer'} onclick={() => (filter = 'transfer')}>traspasos</button>
	<button class:on={filter === 'clause'} onclick={() => (filter = 'clause')}>cláusulas</button>
	<span class="count">{visible.length} eventos</span>
</div>

{#if loading}
	<p class="muted">cargando…</p>
{:else}
	{#each days as day (day.label)}
		<h2 class="section-title day">{day.label}</h2>
		{#each day.events as event (event.id)}
			<EventCard {event} budget={self?.maxBid ?? null} />
		{/each}
	{:else}
		<p class="empty">sin actividad registrada todavía</p>
	{/each}
{/if}

<style>
	.pollers {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}
	.pollers button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: var(--sp-1) var(--sp-3);
		background: var(--bg-card);
		font-size: 0.75rem;
	}
	.pollers button.failing {
		border-color: var(--danger);
	}
	.name {
		font-weight: 600;
	}
	.when {
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	.fail {
		color: var(--danger);
		font-size: 0.7rem;
	}
	.filters {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin-bottom: var(--sp-4);
	}
	.filters button {
		font-size: 0.75rem;
		padding: 2px var(--sp-3);
		color: var(--text-muted);
	}
	.filters button.on {
		color: var(--accent);
		border-color: var(--accent);
	}
	.count {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.day {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--bg);
		padding: var(--sp-2) 0;
		margin-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border);
	}
</style>
