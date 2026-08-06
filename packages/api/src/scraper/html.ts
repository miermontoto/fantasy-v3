// parsers de las páginas html de fantasy marca.
//
// extracción por marcadores, sin librería de dom: los marcadores están verificados
// contra el html real de la temporada 26/27 y son la parte más frágil del sistema.
// si el sitio cambia el markup, es aquí donde hay que mirar primero.

import { SYSTEM_MANAGER } from '../constants.js';

/** contenido entre dos marcadores; null si no aparece el patrón */
export function extractBetween(html: string, start: string, end: string): string | null {
	const from = html.indexOf(start);
	if (from === -1) return null;
	const contentStart = from + start.length;
	const to = html.indexOf(end, contentStart);
	if (to === -1) return null;
	return html.slice(contentStart, to);
}

/** texto tras un marcador de clase, tolerando clases extra: `class="v balance red"> -23 <` */
export function extractClassText(html: string, classMarker: string): string | null {
	const at = html.indexOf(classMarker);
	if (at === -1) return null;
	const gt = html.indexOf('>', at);
	if (gt === -1) return null;
	const lt = html.indexOf('<', gt);
	if (lt === -1) return null;
	return html.slice(gt + 1, lt).trim();
}

/** "1.234.567" → 1234567. tolera signo negativo y basura alrededor */
export function parseEuropeanNumber(text: string): number {
	const negative = text.trim().startsWith('-');
	const digits = text.replace(/[^0-9]/g, '');
	if (!digits) return 0;
	const value = Number(digits);
	return negative ? -value : value;
}

/** "125,5M" → 125500000; "1.234.567" → 1234567 */
export function parseBalanceValue(text: string): number {
	const trimmed = text.trim();
	const negative = trimmed.startsWith('-');
	const body = negative ? trimmed.slice(1) : trimmed;

	const mIndex = body.indexOf('M');
	if (mIndex !== -1) {
		const numeric = body.slice(0, mIndex).replace('.', '').replace(',', '.');
		const millions = Number.parseFloat(numeric);
		if (Number.isNaN(millions)) return 0;
		const value = Math.round(millions * 1_000_000);
		return negative ? -value : value;
	}
	return negative ? -parseEuropeanNumber(body) : parseEuropeanNumber(body);
}

export function stripTags(html: string): string {
	return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** valor numérico de un campo json crudo, termine en coma o en cierre de objeto */
export function extractNumericField(json: string, marker: string): string | null {
	const at = json.indexOf(marker);
	if (at === -1) return null;
	const from = at + marker.length;
	const match = /^\s*(-?\d+)/.exec(json.slice(from, from + 32));
	return match ? match[1] : null;
}

// ===== sesión (_FG_cfg) =====

export interface SessionInfo {
	/** x-auth vigente de la comunidad activa */
	auth: string;
	communityId: string;
	season: string;
	/** saldo actual del mánager propio en la comunidad activa */
	balance: number | null;
	/** id_uc del mánager propio en esta comunidad (member.id de _FG_cfg) */
	selfManagerId: string | null;
}

/**
 * extrae los datos de sesión del objeto `_FG_cfg` que toda página html embebe.
 * es lo que permite renovar el x-auth teniendo solo el refresh-token.
 */
export function parseSessionInfo(html: string): SessionInfo | null {
	const cfgStart = html.indexOf('_FG_cfg = {');
	if (cfgStart === -1) return null;
	const cfg = html.slice(cfgStart);

	const auth = extractBetween(cfg, '"auth":"', '"');
	// el campo puede ir seguido de coma o cerrar el objeto: aceptar ambos
	const communityId = extractNumericField(cfg, '"id_community":');
	if (!auth || !communityId) return null;

	const seasonBlock = extractBetween(cfg, '"season":{', '}');
	const rawSeason = seasonBlock ? extractBetween(seasonBlock, '"name":"', '"') : null;

	const balanceBlock = extractBetween(cfg, '"balance":{', '}');
	const rawBalance = balanceBlock ? extractNumericField(balanceBlock, '"current":') : null;

	// "member":{"id":1345738} identifica al mánager propio dentro de la comunidad
	const memberBlock = extractBetween(cfg, '"member":{', '}');
	const selfManagerId = memberBlock ? extractNumericField(memberBlock, '"id":') : null;

	return {
		auth,
		communityId: communityId.trim(),
		// el json crudo escapa la barra: "26\/27"
		season: rawSeason ? rawSeason.replace('\\/', '/') : '',
		balance: rawBalance ? Number.parseInt(rawBalance.trim(), 10) : null,
		selfManagerId,
	};
}

// ===== traspasos del feed =====

export interface TransferEvent {
	feedId: number;
	playerId: string;
	playerName: string;
	/** null cuando el origen/destino es el sistema (mercado) */
	from: string | null;
	to: string | null;
	price: number;
}

/**
 * extrae los traspasos de las tarjetas `card-transfer` del feed.
 *
 * una tarjeta puede contener varios jugadores, así que la clave de dedup es
 * (feedId, playerId). los eventos del feed hacen scroll y desaparecen: este parser
 * es la razón de que el poller del feed corra cada 15 minutos.
 */
export function parseFeedTransfers(html: string): TransferEvent[] {
	const events: TransferEvent[] = [];
	let cursor = 0;

	while (true) {
		const cardStart = html.indexOf('id="feed-', cursor);
		if (cardStart === -1) break;

		const idStart = cardStart + 'id="feed-'.length;
		const idEnd = html.indexOf('"', idStart);
		if (idEnd === -1) break;

		const feedId = Number.parseInt(html.slice(idStart, idEnd), 10);
		const nextCard = html.indexOf('id="feed-', idEnd);
		const cardEnd = nextCard === -1 ? html.length : nextCard;
		const card = html.slice(idEnd, cardEnd);
		cursor = cardEnd;

		if (Number.isNaN(feedId)) continue;
		// solo tarjetas de traspaso: el tipo va en la etiqueta de apertura
		const tagEnd = card.indexOf('>');
		if (tagEnd === -1 || !card.slice(0, tagEnd).includes('card-transfer')) continue;

		let itemCursor = 0;
		while (true) {
			const nameStart = card.indexOf('<strong>', itemCursor);
			if (nameStart === -1) break;
			itemCursor = nameStart + '<strong>'.length;

			// acotar el item al siguiente <strong> para no robar campos del siguiente
			const nextName = card.indexOf('<strong>', itemCursor);
			const item = card.slice(nameStart, nextName === -1 ? card.length : nextName);

			const playerName = extractBetween(item, '<strong>', '</strong>');
			const fromRaw = extractBetween(item, 'cambia de <em>', '</em>');
			if (!playerName || !fromRaw) continue;

			const afterFrom = item.indexOf('</em>') + '</em>'.length;
			const toRaw = extractBetween(item.slice(afterFrom), '<em>', '</em>');
			const playerId = extractBetween(item, 'href="players/', '/');
			const priceText = extractBetween(item, 'class="price">', '<');
			if (!toRaw || !playerId || !priceText) continue;

			const from = fromRaw.trim();
			const to = toRaw.trim();

			events.push({
				feedId,
				playerId,
				playerName: playerName.trim(),
				from: from === SYSTEM_MANAGER ? null : from,
				to: to === SYSTEM_MANAGER ? null : to,
				price: parseEuropeanNumber(priceText),
			});
		}
	}

	return events;
}

// ===== saldos =====

export interface BalanceInfo {
	current: number;
	/** descuenta las pujas comprometidas; negativo si hay más comprometido que saldo */
	future: number;
	/** ojo: es la capacidad RESTANTE, no el techo (0 si está todo comprometido) */
	remainingDebt: number;
}

export function parseBalanceInfo(html: string): BalanceInfo {
	return {
		current: parseBalanceValue(extractClassText(html, 'balance-real-current') ?? '0'),
		future: parseBalanceValue(extractClassText(html, 'balance-real-future') ?? '0'),
		remainingDebt: parseBalanceValue(extractClassText(html, 'balance-real-maxdebt') ?? '0'),
	};
}

// ===== clasificación =====

export interface StandingsEntry {
	/** id_uc del mánager, extraído de href="users/<id>/slug" */
	managerId: string;
	name: string;
	position: number;
	points: number;
	teamValue: number;
	playersCount: number | null;
}

/**
 * clasificación general. de aquí sale el valor de plantilla de cada rival, que es
 * la mitad del cálculo de su poder de puja (cash + 25% del valor).
 */
export function parseStandings(html: string): StandingsEntry[] {
	const entries: StandingsEntry[] = [];
	const seen = new Set<string>();

	// cada fila es un enlace `users/<id_uc>/<slug>`. la página trae dos pestañas
	// (general y jornada) con los mismos mánagers, así que hay que deduplicar.
	const linkPattern = /href="users\/(\d+)\/[^"]*"/g;
	let match: RegExpExecArray | null;

	while ((match = linkPattern.exec(html)) !== null) {
		const managerId = match[1];
		if (seen.has(managerId)) continue;

		const rowEnd = html.indexOf('</a>', match.index);
		const row = html.slice(match.index, rowEnd === -1 ? html.length : rowEnd);

		// la clase lleva un espacio final en el markup real: `class="name "`
		const name = extractClassText(row, 'class="name');
		if (!name) continue;

		const positionText = extractClassText(row, 'class="position"');
		const pointsText = extractClassText(row, 'class="points"');
		// "14 jugadores · € 215.214.000": conviven número de jugadores y valor
		const playedText = extractClassText(row, 'class="played"');
		const valuePart = playedText?.split('€')[1] ?? null;
		const playersPart = playedText?.split('jugadores')[0] ?? null;

		seen.add(managerId);
		entries.push({
			managerId,
			name: name.trim(),
			position: positionText ? parseEuropeanNumber(positionText) : entries.length + 1,
			points: pointsText ? parseEuropeanNumber(pointsText) : 0,
			teamValue: valuePart ? parseEuropeanNumber(valuePart) : 0,
			playersCount: playersPart ? parseEuropeanNumber(playersPart) || null : null,
		});
	}

	return entries;
}
