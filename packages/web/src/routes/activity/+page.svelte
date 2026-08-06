<script lang="ts">
	// actividad de la liga: traspasos con precio exacto y cambios de cláusula.
	// también el estado de los pollers, que es lo que garantiza que no falte nada.
	import { api, type TransferRow, type ClauseChange, type PollerRow } from '$lib/api';
	import { money, relativeTime } from '$lib/format';

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
	<section>
		<h2>traspasos</h2>
		<ul class="feed">
			{#each transfers as t (t.id)}
				<li>
					<span class="player">{t.playerName}</span>
					<span class="price" class:clause={t.kind === 'clause'}>{money(t.price)}</span>
					<span class="when">{relativeTime(t.seenAt)}</span>
				</li>
			{:else}
				<li class="muted">sin traspasos registrados</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>cláusulas</h2>
		<ul class="feed">
			{#each changes as c (c.playerId + c.ts + c.kind)}
				<li>
					<span class="player"><a href="/players/{c.playerId}">{c.name}</a></span>
					<span class="kind kind-{c.kind}">{KIND_LABEL[c.kind] ?? c.kind}</span>
					{#if c.newClause}<span class="price">{money(c.newClause)}</span>{/if}
					<span class="when">{relativeTime(c.ts)}</span>
				</li>
			{:else}
				<li class="muted">sin cambios registrados</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 1rem;
	}
	h2 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		font-weight: 500;
		margin: 0 0 0.5rem;
	}
	.pollers {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}
	.pollers button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.4rem 0.7rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
	}
	.pollers button:hover:not(:disabled) {
		border-color: var(--accent);
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
		gap: 1.5rem;
	}
	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.8rem;
	}
	.feed li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}
	.player {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.player a {
		color: var(--text);
		text-decoration: none;
	}
	.player a:hover {
		color: var(--accent);
	}
	.price {
		font-variant-numeric: tabular-nums;
	}
	.price.clause {
		color: var(--warning);
	}
	.kind {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.kind-clause_up {
		color: var(--warning);
	}
	.kind-shield_off,
	.kind-owner_change {
		color: var(--accent);
	}
	.muted {
		color: var(--text-muted);
	}
	.error {
		color: var(--danger);
	}
</style>
