// parsers de las respuestas ajax (json) de fantasy marca.
//
// las formas difieren entre endpoints para el mismo concepto, y esas diferencias
// costaron bugs reales en v2: el LISTADO usa `uc_name`/`id_uc` planos y `clausesRank`,
// mientras que el DETALLE usa `owner.name` y `clausesRanking`. además el `shield` del
// listado no es fiable: solo `clause.shield` del detalle lo es.

import { CLAUSE } from '../constants.js';

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

// ===== listado de jugadores (/ajax/sw/players) =====

export interface PlayerListItem {
	id: string;
	name: string;
	position: number;
	teamId: number | null;
	value: number;
	previousValue: number;
	points: number;
	average: number;
	/** null = agente libre */
	ownerId: string | null;
	ownerName: string | null;
	clause: number | null;
	/** cláusula / valor: lo que el dueño controla de verdad */
	clauseMultiplier: number | null;
	clausesRank: number | null;
	/** no fiable en este endpoint; solo el detalle es autoritativo */
	shield: number;
	listed: boolean;
	photoUrl: string | null;
	/** injury | doubt | red | five | null: lo pinta la tarjeta como aviso */
	status: string | null;
	/** puntos de las últimas jornadas; "-" (sin jugar) se guarda como null */
	streak: (number | null)[];
}

export function parsePlayersList(data: unknown): PlayerListItem[] {
	const root = asRecord(data);
	const rawPlayers = root?.players;
	if (!Array.isArray(rawPlayers)) return [];

	const players: PlayerListItem[] = [];
	for (const raw of rawPlayers) {
		const p = asRecord(raw);
		if (!p || p.id === undefined) continue;

		const value = num(p.value);
		const clause = p.clause === null || p.clause === undefined ? null : num(p.clause);

		// el escudo llega como entero (segundos) o string descriptivo cuando está activo
		const shieldRaw = p.shield;
		const shield =
			typeof shieldRaw === 'number' ? shieldRaw : typeof shieldRaw === 'string' && shieldRaw.length > 0 ? 1 : 0;

		const streak = Array.isArray(p.streak)
			? p.streak.map((v) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null))
			: [];

		players.push({
			id: String(p.id),
			name: str(p.name),
			position: num(p.position),
			teamId: p.id_team === undefined ? null : num(p.id_team),
			value,
			previousValue: num(p.prev_value),
			points: num(p.points),
			average: num(p.avg),
			ownerId: p.id_uc === null || p.id_uc === undefined ? null : String(p.id_uc),
			ownerName: p.uc_name === null || p.uc_name === undefined ? null : str(p.uc_name),
			clause,
			clauseMultiplier: clause !== null && value > 0 ? clause / value : null,
			clausesRank: p.clausesRank === null || p.clausesRank === undefined ? null : num(p.clausesRank),
			shield,
			listed: p.id_market !== null && p.id_market !== undefined,
			photoUrl: p.photoUrl === undefined ? null : str(p.photoUrl),
			status: p.status === null || p.status === undefined ? null : str(p.status),
			streak,
		});
	}
	return players;
}

// ===== detalle de jugador (/ajax/player-community-info) =====

export interface PlayerCommunityInfo {
	id: string;
	name: string;
	value: number;
	ownerId: string | null;
	ownerName: string | null;
	marketId: number | null;
	ownBid: number | null;
	clauseValue: number;
	/** porcentaje sobre el suelo: 50 = 1.5x, 100 = 2x */
	clausePercentage: number;
	/** string descriptivo mientras está activo; vacío si no hay escudo */
	shield: string;
	/** tramo 1-5: determina el precio en créditos de escudos */
	tier: number | null;
	/** precio pagado en su último traspaso; null si nunca cambió de manos */
	purchasePrice: number | null;
	/** fecha del traspaso tal cual la da el juego ("3 ago 2026") */
	purchaseDate: string | null;
}

export function parsePlayerCommunityInfo(data: unknown): PlayerCommunityInfo | null {
	const p = asRecord(data);
	if (!p || p.id === undefined) return null;

	const owner = asRecord(p.owner);
	const market = asRecord(p.market);
	const bid = asRecord(p.bid);
	const clause = asRecord(p.clause);

	const rawShield = clause?.shield;
	const ownerId = owner?.id === undefined || owner?.id === null ? null : String(owner.id);
	const transfer = asRecord(p.transfer);
	const rawPrice = transfer?.price;
	const rawDate = transfer?.date;

	return {
		id: String(p.id),
		name: str(p.name),
		value: num(p.value),
		// owner.id === 0 significa agente libre
		ownerId: ownerId === '0' ? null : ownerId,
		ownerName: owner?.name === undefined ? null : str(owner.name),
		marketId: market?.id === null || market?.id === undefined ? null : num(market.id),
		ownBid: bid?.amount === null || bid?.amount === undefined ? null : num(bid.amount),
		clauseValue: num(clause?.value),
		clausePercentage: clause?.percentage === undefined ? 50 : num(clause.percentage),
		shield: typeof rawShield === 'string' ? rawShield : '',
		tier: clause?.tier === undefined ? null : num(clause.tier),
		purchasePrice: typeof rawPrice === 'number' ? rawPrice : null,
		purchaseDate: typeof rawDate === 'string' ? rawDate : null,
	};
}

// ===== saldo propio =====

export interface QuickBalance {
	current: number;
	future: number;
	/** capacidad restante, ya descontadas las pujas comprometidas */
	remainingDebt: number;
}

export function parseQuickBalance(data: unknown): QuickBalance | null {
	const d = asRecord(data);
	if (!d) return null;
	return {
		current: num(d.current),
		future: num(d.future),
		remainingDebt: num(d.maxDebt),
	};
}

export interface BalanceMovement {
	ts: number;
	date: string;
	/** Compra | Venta | Compra por cláusula | Venta por cláusula | Penalización | Bonificación */
	type: string;
	reason: string;
	amount: number;
	balance: number;
}

/**
 * historial de movimientos del mánager propio. es la única fuente exacta: incluye
 * las penalizaciones por subir cláusula y las bonificaciones de saldo inicial que
 * ningún otro endpoint expone.
 */
export function parseBalanceHistory(data: unknown): BalanceMovement[] {
	const d = asRecord(data);
	const history = d?.history;
	if (!Array.isArray(history)) return [];

	const movements: BalanceMovement[] = [];
	for (const raw of history) {
		const m = asRecord(raw);
		if (!m) continue;
		movements.push({
			ts: num(m.ts),
			date: str(m.adate),
			type: str(m.type),
			reason: str(m.reason)
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim(),
			amount: num(m.amount),
			balance: num(m.balance),
		});
	}
	return movements;
}

// ===== calendario =====

export interface GameweekInfo {
	id: number;
	number: number;
	season: string;
	status: string;
	firstMatchAt: number | null;
	lastMatchAt: number | null;
}

export function parseGameweeks(data: unknown): GameweekInfo[] {
	const d = asRecord(data);
	const list = d?.gameweeks;
	if (!Array.isArray(list)) return [];

	const weeks: GameweekInfo[] = [];
	for (const raw of list) {
		const g = asRecord(raw);
		if (!g || g.id === undefined) continue;
		weeks.push({
			id: num(g.id),
			number: num(g.gameweek),
			season: str(g.season).replace('\\/', '/'),
			status: str(g.status),
			firstMatchAt: parseSpanishDateTime(str(g.firstMatchDate)),
			lastMatchAt: parseSpanishDateTime(str(g.lastMatchDate)),
		});
	}
	return weeks;
}

/** "2026-08-15 19:30:00" → epoch ms; null si no parsea */
function parseSpanishDateTime(text: string): number | null {
	if (!text) return null;
	const ms = Date.parse(text.replace(' ', 'T'));
	return Number.isNaN(ms) ? null : ms;
}

// ===== histórico de valor (values_chart del detalle) =====

/** meses tal y como los etiqueta el juego en `values_chart.points[].date` */
const SPANISH_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * etiqueta de día en el formato del juego ("1 ago 2026"): sin cero a la izquierda
 * y con el mes abreviado en español. es la clave del histórico de valores.
 */
export function spanishDay(date: Date): string {
	return `${date.getDate()} ${SPANISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * serie diaria de valor de un jugador (366 días) indexada por etiqueta de día.
 *
 * es la pieza que permite valorar una plantilla en una fecha PASADA, y con ella
 * reconstruir el `Saldo inicial` exacto de cualquier mánager en vez de estimarlo.
 */
export function parseValueHistory(data: unknown): Map<string, number> {
	const chart = asRecord(asRecord(data)?.values_chart);
	const points = Array.isArray(chart?.points) ? chart.points : [];
	const series = new Map<string, number>();
	for (const raw of points) {
		const point = asRecord(raw);
		if (!point) continue;
		const day = str(point.date);
		if (day) series.set(day, num(point.value));
	}
	return series;
}

// ===== cláusulas =====

/**
 * escalones por encima del multiplicador base.
 *
 * el divisor es el SUELO, nunca el valor: `cláusula / valor` se mueve solo con el
 * mercado porque el suelo es `max(precio_pagado, valor)` y se congela al comprar.
 *
 * se redondea al escalón entero a propósito. el multiplicador solo puede valer
 * 1.5, 2.0, 2.5, 3.0, 3.5 o 4.0, así que un número fraccionario es SIEMPRE deriva
 * (el suelo guardado es el de la última pasada profunda y la cláusula sigue al
 * valor a diario), nunca una subida real. sin redondear, esa deriva se cobraba
 * como un trocito de escalón que nadie pagó.
 */
export function clauseSteps(clause: number, floor: number): number {
	if (floor <= 0 || clause <= 0) return 0;
	const multiplier = clause / floor;
	const steps = Math.round((multiplier - CLAUSE.BASE_MULTIPLIER) / CLAUSE.STEP_SIZE);
	return Math.min(Math.max(steps, 0), 5);
}

/**
 * coste en cash de mover la cláusula entre dos números de escalones.
 *
 * es LINEAL: cada escalón de +0.5 cuesta el 20% del suelo, siempre el mismo, así
 * que ir del 1.5 al 4.0 cuesta el suelo ENTERO, no el triple. copiado del cliente
 * del juego (`dist/js/listeners.js`, handler de `#clause_range`):
 *
 *   var cost = Math.floor(floor * 0.2 * (val - def));
 *
 * heredamos de v2 una escalera triangular (`base × nº_escalón` acumulado) que
 * cobraba 3× el suelo por llegar al 4.0 e inflaba el gasto de media liga.
 * bajar reembolsa el 50%, así que un movimiento negativo devuelve un número negativo.
 *
 * al ser lineal el coste es INDEPENDIENTE DEL CAMINO: da igual subir de golpe o de
 * escalón en escalón, y por eso reconstruir el gasto desde el multiplicador actual
 * es válido.
 */
export function clauseLadderCost(value: number, stepsFrom: number, stepsTo: number): number {
	if (stepsTo === stepsFrom) return 0;
	const delta = value * CLAUSE.STEP_RATE * (stepsTo - stepsFrom);
	return delta < 0 ? -Math.floor(Math.abs(delta) * CLAUSE.REFUND_PCT) : Math.floor(delta);
}
