<script lang="ts">
	// referencia a un mánager: chip enlazado a su plantilla. es a los mánagers lo
	// que PositionTag a las posiciones, para que un nombre se lea igual esté donde
	// esté (feed, plantilla, ficha) en vez de como texto suelto en cada vista.
	import Chip from '$lib/components/Chip.svelte';
	import type { ActivityActor } from '$lib/api';

	interface Props {
		/** null = el mercado: no es un mánager y no tiene plantilla que visitar */
		actor: ActivityActor | null;
	}
	let { actor }: Props = $props();
</script>

{#if actor}
	<a class="tag" href="/managers/{actor.id}">
		<Chip
			c={actor.isSelf ? 'var(--accent)' : null}
			variant={actor.isSelf ? 'tint' : 'glass'}
			title={actor.isSelf ? 'tú' : actor.name}
		>
			{actor.name}
		</Chip>
	</a>
{:else}
	<Chip variant="glass" title="agente libre: no hay mánager detrás">mercado</Chip>
{/if}

<style>
	/* el hover tiñe el chip entero, no solo el texto */
	.tag {
		display: inline-flex;
		max-width: 10rem;
	}
	.tag:hover :global(.chip) {
		color: var(--accent);
	}
</style>
