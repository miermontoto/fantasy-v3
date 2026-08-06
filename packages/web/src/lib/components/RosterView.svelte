<script lang="ts">
	// visor de plantillas: la de un mánager o la de la liga entera. el modo «toda
	// la liga» es lo que sustituye al tablero de cláusulas, porque buscar objetivos
	// de robo era mirar plantillas ajenas ordenadas por lo que cuesta llevárselas.
	import { api, type ManagerInfo, type ManagerRow, type RosterPlayer } from '$lib/api';
	import { money, position } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import ManagerTag from '$lib/components/ManagerTag.svelte';
	import PlayerCard from '$lib/components/PlayerCard.svelte';

	interface Props {
		/** null = toda la liga */
		ownerId?: string | null;
	}
	let { ownerId = null }: Props = $props();

	let players = $state<RosterPlayer[]>([]);
	let managers = $state<ManagerInfo[]>([]);
	let self = $state<ManagerRow | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(true);

	// filtro de posición como en v1: sin selección = todas
	let positions = $state<Set<number>>(new Set());
	let search = $state('');
	let onlyStealable = $state(false);
	let sort = $state<'pos' | 'value' | 'clause' | 'stolen' | 'points'>('pos');
	/** todos | owned = con dueño | free = agentes libres */
	let ownership = $state<'all' | 'owned' | 'free'>('all');

	$effect(() => {
		const id = ownerId;
		loading = true;
		Promise.all([api.roster(id), api.managers(), api.ledger()])
			.then(([r, m, l]) => {
				players = r.players;
				managers = m.managers;
				self = l.managers.find((x) => x.isSelf) ?? null;
				loading = false;
			})
			.catch((err: Error) => {
				error = err.message;
				loading = false;
			});
	});

	const current = $derived(managers.find((m) => m.id === ownerId) ?? null);
	const budget = $derived(self?.maxBid ?? null);
	// mirando la plantilla propia no hay nada que robar: el filtro sobra
	const canSteal = $derived(budget !== null && !current?.isSelf);
	const byId = $derived(new Map(managers.map((m) => [m.id, m])));

	function togglePosition(pos: number) {
		const next = new Set(positions);
		if (next.has(pos)) next.delete(pos);
		else next.add(pos);
		positions = next;
	}

	/** robable = sin escudo, con cláusula y cabiendo en el techo de puja */
	const stealable = (p: RosterPlayer): boolean =>
		p.shield === 0 && p.clause !== null && budget !== null && p.clause <= budget && !byId.get(p.ownerId ?? '')?.isSelf;

	const filtered = $derived(
		players
			.filter((p) => {
				if (positions.size > 0 && !positions.has(p.position)) return false;
				if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
				if (ownership === 'owned' && p.ownerId === null) return false;
				if (ownership === 'free' && p.ownerId !== null) return false;
				if (onlyStealable && !stealable(p)) return false;
				return true;
			})
			// cláusula y «más robados» ordenan ascendente (lo más barato y el puesto
			// 1 primero); los que no tienen el dato caen al final en vez de colarse
			// como si fueran cero
			.sort((a, b) => {
				if (sort === 'value') return b.value - a.value;
				if (sort === 'points') return b.points - a.points;
				if (sort === 'clause') return (a.clause ?? Infinity) - (b.clause ?? Infinity);
				if (sort === 'stolen') return (a.clausesRank ?? Infinity) - (b.clausesRank ?? Infinity);
				return a.position - b.position || b.value - a.value;
			}),
	);

	const freeAgents = $derived(players.filter((p) => p.ownerId === null).length);

	const totals = $derived({
		value: filtered.reduce((sum, p) => sum + p.value, 0),
		clause: filtered.reduce((sum, p) => sum + (p.clause ?? 0), 0),
		stealable: budget === null ? 0 : filtered.filter(stealable).length,
	});
</script>

<h1>
	{current?.name ?? 'toda la liga'}
	{#if current?.isSelf}<Chip c="var(--accent)" variant="tint">tú</Chip>{/if}
</h1>

<nav class="managers">
	<a href="/managers" class:active={ownerId === null}>toda la liga</a>
	{#each managers as m (m.id)}
		<a href="/managers/{m.id}" class:active={m.id === ownerId}>{m.name}</a>
	{/each}
</nav>

{#if loading}
	<p class="muted">cargando…</p>
{:else if error}
	<p class="error">no se pudo cargar: {error}</p>
{:else}
	<section class="stats-grid">
		<div class="stat-card">
			<span class="stat-value">{filtered.length}</span>
			<span class="stat-label">jugadores</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{money(totals.value)}</span>
			<span class="stat-label">valor de mercado</span>
		</div>
		<div class="stat-card">
			<span class="stat-value">{money(totals.clause)}</span>
			<span class="stat-label">suma de cláusulas</span>
		</div>
		{#if ownerId === null}
			<div class="stat-card" title="sin dueño: se fichan del mercado, no por cláusula">
				<span class="stat-value">{freeAgents}</span>
				<span class="stat-label">agentes libres</span>
			</div>
		{/if}
		{#if canSteal}
			<div class="stat-card" title="sin escudo y con la cláusula dentro de tu techo de puja">
				<span class="stat-value">{totals.stealable}</span>
				<span class="stat-label">robables con {money(budget ?? 0)}</span>
			</div>
		{/if}
	</section>

	<div class="filters">
		<div class="positions">
			{#each [1, 2, 3, 4] as pos (pos)}
				<button
					style:--c={`var(--pos-${pos})`}
					class:on={positions.has(pos)}
					onclick={() => togglePosition(pos)}
				>
					<span>{position(pos)}</span>
				</button>
			{/each}
		</div>

		<input type="search" placeholder="buscar jugador" bind:value={search} />

		<select bind:value={sort} title="orden de la lista">
			<option value="pos">por posición</option>
			<option value="value">por valor</option>
			<option value="clause">por cláusula</option>
			<option value="stolen">más robados</option>
			<option value="points">por puntos</option>
		</select>

		{#if ownerId === null && freeAgents > 0}
			<select bind:value={ownership} title="quién tiene al jugador">
				<option value="all">todos</option>
				<option value="owned">con dueño</option>
				<option value="free">agentes libres</option>
			</select>
		{/if}

		{#if canSteal}
			<label>
				<input type="checkbox" bind:checked={onlyStealable} />
				solo robables
			</label>
		{/if}
	</div>

	<div class="list">
		{#each filtered as player (player.playerId)}
			<PlayerCard
				{player}
				budget={current?.isSelf ? null : budget}
				owner={ownerId === null ? (byId.get(player.ownerId ?? '') ?? null) : null}
			/>
		{:else}
			<p class="empty">sin jugadores que cumplan el filtro</p>
		{/each}
	</div>

	<p class="note">
		la cláusula se puede pagar siempre que no haya escudo activo. «robables» compara la cláusula
		con tu techo de puja, que es el saldo más la deuda permitida: pagar una cláusula al límite te
		deja sin capacidad de compra hasta que vendas. los agentes libres no tienen cláusula: se
		fichan pujando en el mercado. «más robados» ordena por el ranking de cláusulas pagadas que
		publica el juego, no por lo que cuesta llevárselos.
	</p>
{/if}

<style>
	h1 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.managers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin-bottom: var(--sp-4);
	}
	.managers a {
		font-size: 0.75rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.15rem var(--sp-2);
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.managers a.active,
	.managers a:hover {
		color: var(--text);
		border-color: var(--accent);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-2);
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.filters label {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		cursor: pointer;
	}
	.positions {
		display: flex;
		gap: var(--sp-1);
	}
	/* botones de posición con el skew de v1: apagados en contorno, encendidos
	   en sólido del color de la posición */
	.positions button {
		transform: skewX(var(--skew));
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px var(--sp-3);
		color: var(--c);
		opacity: 0.45;
	}
	.positions button span {
		display: block;
		transform: skewX(var(--unskew));
	}
	.positions button:hover {
		opacity: 0.8;
		background: transparent;
		border-color: var(--c);
	}
	.positions button.on {
		opacity: 1;
		background: var(--c);
		border-color: var(--c);
		color: var(--on-accent);
	}
</style>
