<script lang="ts">
	// un evento del feed: cabecera con qué pasó y entre quiénes, y debajo la tarjeta
	// del jugador implicado. la cabecera responde «quién y cuánto» y la tarjeta
	// «de quién estamos hablando», que era justo lo que faltaba cuando el feed eran
	// líneas de texto con el nombre a secas.
	import type { ActivityEvent } from '$lib/api';
	import { money, relativeTime } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import ManagerTag from '$lib/components/ManagerTag.svelte';
	import PlayerCard from '$lib/components/PlayerCard.svelte';

	interface Props {
		event: ActivityEvent;
		/** presupuesto con el que marcar robables en la tarjeta; null = no marcar */
		budget?: number | null;
	}
	let { event, budget = null }: Props = $props();

	const KIND_LABEL: Record<string, string> = {
		market: 'traspaso',
		clause: 'clausulazo',
		loan: 'cesión',
		clause_up: 'subió cláusula',
		clause_down: 'bajó cláusula',
		shield_on: 'blindó',
		shield_off: 'expiró escudo',
		owner_change: 'cambió de dueño',
		acquired: 'fichado',
		released: 'liberado',
	};

	// color por tipo: lo que cuesta dinero o cierra una puerta avisa (warning),
	// lo que abre una oportunidad destaca (accent)
	const KIND_COLOR: Record<string, string> = {
		clause: 'var(--warning)',
		clause_up: 'var(--warning)',
		shield_on: 'var(--warning)',
		clause_down: 'var(--accent)',
		shield_off: 'var(--accent)',
		owner_change: 'var(--accent)',
		released: 'var(--accent)',
	};

	// los cambios de cláusula y escudo los hace el dueño sobre su propio jugador:
	// pintar «X → X» sería ruido. el resto sí es un movimiento entre dos partes.
	const OWNER_ONLY = new Set(['clause_up', 'clause_down', 'shield_on', 'shield_off']);

	const pair = $derived(!OWNER_ONLY.has(event.kind));
	const owner = $derived(event.to ?? event.from);
	// un traspaso lleva precio; un cambio de cláusula, el salto de una a otra.
	// una cláusula anterior de 0 no es un salto desde cero: es que no se conocía
	// (el diff la emite así cuando el snapshot previo no traía cláusula), y
	// pintar «0.00M →» haría creer que el jugador no tenía cláusula
	const jump = $derived(
		event.oldClause !== null &&
			event.oldClause > 0 &&
			event.newClause !== null &&
			event.oldClause !== event.newClause,
	);
</script>

<article class="event">
	<header>
		<Chip c={KIND_COLOR[event.kind] ?? null} variant="tint">
			{KIND_LABEL[event.kind] ?? event.kind}
		</Chip>

		<div class="who">
			{#if pair}
				<ManagerTag actor={event.from} />
				<span class="arrow">→</span>
				<ManagerTag actor={event.to} />
			{:else}
				<ManagerTag actor={owner} />
			{/if}
		</div>

		<span class="amount" class:clause={event.kind === 'clause'}>
			{#if event.price !== null}
				{money(event.price)}
			{:else if jump}
				<span class="old">{money(event.oldClause ?? 0)}</span>
				<span class="arrow">→</span>
				{money(event.newClause ?? 0)}
			{:else if event.newClause !== null}
				{money(event.newClause)}
			{/if}
		</span>

		<time class="when" title={new Date(event.ts).toLocaleString('es-ES')}>{relativeTime(event.ts)}</time>
	</header>

	{#if event.player}
		<PlayerCard player={event.player} {budget} />
	{:else}
		<!-- el poller de cláusulas aún no ha visto a este jugador: queda el nombre
		     del feed, que es lo único que se sabe de él -->
		<p class="unknown"><a href="/players/{event.playerId}">{event.playerName}</a></p>
	{/if}
</article>

<style>
	.event {
		margin-bottom: var(--sp-3);
	}
	header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: 0 var(--sp-1) var(--sp-1);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		min-width: 0;
	}
	.arrow {
		color: var(--text-faint);
		font-size: 0.7rem;
	}
	.amount {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}
	.amount.clause {
		color: var(--warning);
	}
	.old {
		color: var(--text-muted);
		font-weight: 400;
	}
	.when {
		color: var(--text-muted);
		font-size: 0.7rem;
		white-space: nowrap;
	}
	.unknown {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--sp-2) var(--sp-3);
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>
