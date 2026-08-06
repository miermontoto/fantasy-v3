<script lang="ts">
	// flecha de tendencia con el código de color de v1 (↑ verde, ↓ rojo, ~ ámbar);
	// opcionalmente acompaña el delta con signo.
	import { signedMoney, trendClass } from '$lib/format';

	interface Props {
		value: number;
		showDelta?: boolean;
	}
	let { value, showDelta = false }: Props = $props();
</script>

<span class="trend {trendClass(value)}">
	{value > 0 ? '↑' : value < 0 ? '↓' : '~'}{#if showDelta}
		{' '}{signedMoney(value)}{/if}
</span>

<style>
	.trend {
		font-size: 0.75rem;
		color: var(--warning);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.trend.up {
		color: var(--success);
	}
	.trend.down {
		color: var(--danger);
	}
</style>
