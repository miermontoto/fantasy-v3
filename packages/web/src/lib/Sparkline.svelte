<script lang="ts">
	// sparkline svg mínima: para una serie corta no merece la pena cargar echarts.
	interface Props {
		points: number[];
		width?: number;
		height?: number;
	}
	let { points, width = 80, height = 20 }: Props = $props();

	const path = $derived.by(() => {
		if (points.length < 2) return '';
		const min = Math.min(...points);
		const max = Math.max(...points);
		const span = max - min || 1;
		return points
			.map((value, index) => {
				const x = (index / (points.length - 1)) * width;
				const y = height - ((value - min) / span) * height;
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});

	const rising = $derived(points.length > 1 && points[points.length - 1] >= points[0]);
</script>

{#if path}
	<svg {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
		<path d={path} fill="none" stroke-width="1.5" class={rising ? 'up' : 'down'} />
	</svg>
{:else}
	<span class="empty">—</span>
{/if}

<style>
	svg {
		display: block;
	}
	path.up {
		stroke: var(--success);
	}
	path.down {
		stroke: var(--danger);
	}
	.empty {
		color: var(--text-muted);
		font-size: 0.75rem;
	}
</style>
