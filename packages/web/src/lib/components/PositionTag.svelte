<script lang="ts">
	// etiqueta de posición: chip sólido con el color de la familia --pos-N.
	import Chip from '$lib/components/Chip.svelte';
	import { position as positionLabel } from '$lib/format';

	interface Props {
		position: number;
	}
	let { position }: Props = $props();

	// fuera de 1..4 no hay color: chip apagado con «?» (regla v1 de dato desconocido)
	const known = $derived(position >= 1 && position <= 4);
</script>

<Chip c={known ? `var(--pos-${position})` : null} variant={known ? 'solid' : 'glass'} title={known ? undefined : 'posición desconocida'}>
	{known ? positionLabel(position) : '?'}
</Chip>
