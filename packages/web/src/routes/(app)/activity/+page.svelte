<script lang="ts">
	// actividad de la liga: traspasos con precio exacto y cambios de cláusula.
	// también el estado de los pollers, que es lo que garantiza que no falte nada.
	import { api, type TransferRow, type ClauseChange, type PollerRow } from '$lib/api';
	import { money, relativeTime } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';

	let transfers = $state<TransferRow[]>([]);
	let changes = $state<ClauseChange[]>([]);
	let pollers = $state<PollerRow[]>([]);
	let error = $state<string | null>(null);
	let syncing = $state<string | null>(null);

	function load() {
		Promise.all([api.transfers(40), api.clauseChanges(40), api.pollers()])
			.then(([t, c, p]) => {
				transfers = t.transfers;
				changes = c.changes;
				pollers = p.pollers;
			})
			.catch((err: Error) => (error = err.message));
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

	const KIND_LABEL: Record<string, string> = {
		clause_up: 'subió cláusula',
		clause_down: 'bajó cláusula',
		shield_on: 'blindó',
		shield_off: 'expiró escudo',
		owner_change: 'cambió de dueño',
		acquired: 'fichado',
		released: 'liberado',
	};
	// color por tipo de evento: subidas avisan, oportunidades destacan
	const KIND_COLOR: Record<string, string> = {
		clause_up: 'var(--warning)',
		shield_off: 'var(--accent)',
		owner_change: 'var(--accent)',
	};
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

<div class="columns">
	<section class="card">
		<h2 class="section-title">traspasos</h2>
		<ul class="feed">
			{#each transfers as t (t.id)}
				<li>
					<span class="player"><a href="/players/{t.playerId}">{t.playerName}</a></span>
					{#if t.kind === 'clause'}<Chip c="var(--warning)" variant="tint">clausulazo</Chip>{/if}
					<span class="price" class:clause={t.kind === 'clause'}>{money(t.price)}</span>
					<span class="when">{relativeTime(t.seenAt)}</span>
				</li>
			{:else}
				<li class="empty">sin traspasos registrados</li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<h2 class="section-title">cláusulas</h2>
		<ul class="feed">
			{#each changes as c (c.playerId + c.ts + c.kind)}
				<li>
					<span class="player"><a href="/players/{c.playerId}">{c.name}</a></span>
					<Chip c={KIND_COLOR[c.kind] ?? null} variant="tint">{KIND_LABEL[c.kind] ?? c.kind}</Chip>
					{#if c.newClause}<span class="price">{money(c.newClause)}</span>{/if}
					<span class="when">{relativeTime(c.ts)}</span>
				</li>
			{:else}
				<li class="empty">sin cambios registrados</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.pollers {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-bottom: var(--sp-5);
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
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--sp-4);
		align-items: start;
	}
	.feed {
		list-style: none;
		font-size: 0.8rem;
	}
	.feed li {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}
	.feed li:last-child {
		border-bottom: none;
	}
	.player {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.price {
		font-variant-numeric: tabular-nums;
	}
	.price.clause {
		color: var(--warning);
	}
</style>
