<script lang="ts">
	// ficha con la evolución de valor y cláusula: es lo que ninguna versión anterior
	// pudo mostrar, porque hasta v3 no se guardaba histórico.
	import { api, type ActivityActor, type ActivityEvent, type PlayerInfo, type PlayerPoint } from '$lib/api';
	import { money } from '$lib/format';
	import Chip from '$lib/components/Chip.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import ManagerTag from '$lib/components/ManagerTag.svelte';
	import PositionTag from '$lib/components/PositionTag.svelte';
	import Trend from '$lib/components/Trend.svelte';
	import { page } from '$app/state';
	import * as echarts from 'echarts/core';
	import { LineChart } from 'echarts/charts';
	import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
	import { CanvasRenderer } from 'echarts/renderers';

	echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

	const HISTORY_DAYS = 60;
	const EVENT_LIMIT = 20;

	let info = $state<PlayerInfo | null>(null);
	let history = $state<PlayerPoint[]>([]);
	let owner = $state<ActivityActor | null>(null);
	let events = $state<ActivityEvent[]>([]);
	let error = $state<string | null>(null);
	let chartEl = $state<HTMLDivElement | null>(null);
	let photoBroken = $state(false);

	$effect(() => {
		const id = page.params.id;
		if (!id) return;
		Promise.all([api.player(id, HISTORY_DAYS), api.activity(EVENT_LIMIT, id), api.ledger()])
			.then(([data, feed, ledger]) => {
				info = data.player;
				history = data.history;
				events = feed.events;
				// el dueño sale del ledger: el snapshot solo trae su id
				const ownerId = data.history.at(-1)?.ownerId ?? null;
				const row = ownerId ? ledger.managers.find((m) => m.managerId === ownerId) : null;
				owner = row ? { id: row.managerId, name: row.name, isSelf: row.isSelf } : null;
			})
			.catch((err: Error) => (error = err.message));
	});

	$effect(() => {
		if (!chartEl || history.length === 0) return;

		const chart = echarts.init(chartEl, null, { renderer: 'canvas' });
		const style = getComputedStyle(document.documentElement);
		const accent = style.getPropertyValue('--accent').trim();
		const warn = style.getPropertyValue('--warning').trim();
		const muted = style.getPropertyValue('--text-muted').trim();

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
				splitLine: { lineStyle: { color: style.getPropertyValue('--border').trim() } },
			},
			series: [
				{ name: 'valor', type: 'line', smooth: true, showSymbol: false, data: history.map((p) => p.value), lineStyle: { color: accent }, itemStyle: { color: accent } },
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
	<header class="player-head">
		{#if info.photoUrl && !photoBroken}
			<img class="photo" src={info.photoUrl} alt="" onerror={() => (photoBroken = true)} />
		{:else}
			<div class="photo placeholder">?</div>
		{/if}
		<div class="who">
			<h1>{info.name}</h1>
			<div class="meta">
				<PositionTag position={info.position} />
				{#if owner}<ManagerTag actor={owner} />{/if}
				{#if latest && latest.shield !== 0}
					<Chip c="var(--warning)" variant="tint">blindado ⛨</Chip>
				{/if}
			</div>
		</div>
	</header>

	{#if latest}
		<section class="stats-grid">
			<div class="stat-card">
				<span class="stat-value">{money(latest.value)}</span>
				<span class="stat-label">valor</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{latest.clause ? money(latest.clause) : '—'}</span>
				<span class="stat-label">cláusula</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">
					{latest.clauseMultiplier ? `${latest.clauseMultiplier.toFixed(2)}×` : '—'}
				</span>
				<span class="stat-label">multiplicador</span>
			</div>
			<div class="stat-card">
				<span class="stat-value plain"><Trend value={valueChange} showDelta /></span>
				<span class="stat-label">cambio en el periodo</span>
			</div>
		</section>
	{/if}

	{#if history.length > 1}
		<div class="chart card" bind:this={chartEl}></div>
	{:else}
		<p class="muted">
			todavía no hay histórico suficiente: la serie empieza a construirse con cada pasada del
			poller de cláusulas.
		</p>
	{/if}

	<h2 class="section-title feed-title">actividad</h2>
	{#each events as event (event.id)}
		<EventCard {event} />
	{:else}
		<p class="empty">sin movimientos registrados para este jugador</p>
	{/each}
{:else}
	<p class="muted">cargando…</p>
{/if}

<style>
	.player-head {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}
	.player-head h1 {
		margin-bottom: 0;
		color: var(--text);
	}
	.photo {
		width: 48px;
		height: 56px;
		object-fit: cover;
		border-radius: var(--radius);
		background: var(--bg-hover);
		flex-shrink: 0;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-faint);
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.stat-value.plain {
		color: var(--text);
	}
	.stat-value.plain :global(.trend) {
		font-size: inherit;
	}
	.chart {
		width: 100%;
		height: 320px;
		padding: var(--sp-2);
	}
	.feed-title {
		margin-top: var(--sp-5);
	}
</style>
