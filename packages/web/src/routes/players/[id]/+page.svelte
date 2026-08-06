<script lang="ts">
	// ficha con la evolución de valor y cláusula: es lo que ninguna versión anterior
	// pudo mostrar, porque hasta v3 no se guardaba histórico.
	import { api, type PlayerPoint } from '$lib/api';
	import { money, position } from '$lib/format';
	import { page } from '$app/state';
	import * as echarts from 'echarts/core';
	import { LineChart } from 'echarts/charts';
	import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
	import { CanvasRenderer } from 'echarts/renderers';

	echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

	let info = $state<{ id: string; name: string; position: number } | null>(null);
	let history = $state<PlayerPoint[]>([]);
	let error = $state<string | null>(null);
	let chartEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const id = page.params.id;
		if (!id) return;
		api
			.player(id, 60)
			.then((data) => {
				info = data.player;
				history = data.history;
			})
			.catch((err: Error) => (error = err.message));
	});

	$effect(() => {
		if (!chartEl || history.length === 0) return;

		const chart = echarts.init(chartEl, null, { renderer: 'canvas' });
		const style = getComputedStyle(document.documentElement);
		const accent = style.getPropertyValue('--fantasy-accent').trim();
		const warn = style.getPropertyValue('--fantasy-warn').trim();
		const muted = style.getPropertyValue('--fantasy-muted').trim();

		chart.setOption({
			grid: { left: 56, right: 16, top: 28, bottom: 28 },
			tooltip: { trigger: 'axis', valueFormatter: (v: number) => money(v) },
			legend: { data: ['valor', 'cláusula'], textStyle: { color: muted }, top: 0 },
			xAxis: {
				type: 'category',
				data: history.map((p) => new Date(p.ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })),
				axisLine: { lineStyle: { color: muted } },
				axisLabel: { color: muted, fontSize: 10 },
			},
			yAxis: {
				type: 'value',
				axisLabel: { color: muted, fontSize: 10, formatter: (v: number) => money(v) },
				splitLine: { lineStyle: { color: style.getPropertyValue('--fantasy-border').trim() } },
			},
			series: [
				{ name: 'valor', type: 'line', smooth: true, showSymbol: false, data: history.map((p) => p.value), lineStyle: { color: accent } , itemStyle: { color: accent } },
				{ name: 'cláusula', type: 'line', smooth: true, showSymbol: false, data: history.map((p) => p.clause), lineStyle: { color: warn }, itemStyle: { color: warn } },
			],
		});

		const resize = () => chart.resize();
		window.addEventListener('resize', resize);
		return () => {
			window.removeEventListener('resize', resize);
			chart.dispose();
		};
	});

	const latest = $derived(history.at(-1) ?? null);
	const first = $derived(history.at(0) ?? null);
	const valueChange = $derived(latest && first ? latest.value - first.value : 0);
</script>

{#if error}
	<p class="error">no se pudo cargar: {error}</p>
{:else if info}
	<h1>
		{info.name}
		<span class="pos pos-{info.position}">{position(info.position)}</span>
	</h1>

	{#if latest}
		<section class="summary">
			<div><span class="label">valor</span><span class="figure">{money(latest.value)}</span></div>
			<div>
				<span class="label">cláusula</span>
				<span class="figure">{latest.clause ? money(latest.clause) : '—'}</span>
			</div>
			<div>
				<span class="label">multiplicador</span>
				<span class="figure">{latest.clauseMultiplier ? `${latest.clauseMultiplier.toFixed(2)}×` : '—'}</span>
			</div>
			<div>
				<span class="label">cambio en el periodo</span>
				<span class="figure" class:up={valueChange > 0} class:down={valueChange < 0}>
					{valueChange >= 0 ? '+' : ''}{money(valueChange)}
				</span>
			</div>
		</section>
	{/if}

	{#if history.length > 1}
		<div class="chart" bind:this={chartEl}></div>
	{:else}
		<p class="muted">
			todavía no hay histórico suficiente: la serie empieza a construirse con cada pasada del
			poller de cláusulas.
		</p>
	{/if}
{:else}
	<p class="muted">cargando…</p>
{/if}

<style>
	h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--fantasy-border);
		background: var(--fantasy-surface);
		margin-bottom: 1rem;
	}
	.summary div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fantasy-muted);
	}
	.figure {
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
	}
	.chart {
		width: 100%;
		height: 320px;
	}
	.up {
		color: var(--fantasy-up);
	}
	.down {
		color: var(--fantasy-down);
	}
	.muted {
		color: var(--fantasy-muted);
	}
	.error {
		color: var(--fantasy-down);
	}
	.pos {
		font-size: 0.75rem;
		font-weight: 600;
	}
	.pos-1 {
		color: var(--pos-gk);
	}
	.pos-2 {
		color: var(--pos-def);
	}
	.pos-3 {
		color: var(--pos-mid);
	}
	.pos-4 {
		color: var(--pos-fwd);
	}
</style>
