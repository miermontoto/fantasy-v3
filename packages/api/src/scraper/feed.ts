// parser del feed paginado (POST /ajax/feed).
//
// el feed NO se pierde por scroll: la web lo pagina con el objeto `_FG_data.feed`
// serializado por jquery (`end=false&loading=false&offset=N&cardsPerPage=20`) y
// responde `status:"end"` al llegar al final. son ~230 tarjetas para una temporada
// entera, así que la historia completa se puede reconstruir cuando haga falta.
//
// esta vía es además MEJOR que las tarjetas html: el json trae `id_uc_from`/`id_uc_to`
// numéricos, así que no hay que casar por nombre de equipo ni mantener alias.
//
// verificado contra el historial de balance propio: los 22 movimientos de compra y
// venta del balance aparecen en el feed, sin faltar ni sobrar ninguno.

import { SYSTEM_MANAGER } from '../constants.js';

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

/**
 * `created` viene como "2026-08-02 17:00:05" en hora de la liga (Europe/Madrid).
 * se guarda también en crudo porque es la clave de orden natural del feed y la que
 * permite comparar contra el corte del reset sin arrastrar husos horarios.
 */
export interface FeedTransfer {
	feedId: number;
	transferId: number;
	playerId: string;
	playerName: string;
	/** null = el sistema (mercado). el json lo codifica como id_uc 0 */
	fromManagerId: string | null;
	toManagerId: string | null;
	fromName: string;
	toName: string;
	price: number;
	/** normal = mercado, clause = clausulazo */
	kind: 'market' | 'clause';
	createdAt: string;
	occurredAt: number;
}

/** renombre de equipo: sustituye al mapa manual de alias de v2 */
export interface FeedRename {
	feedId: number;
	previousName: string;
	newName: string;
	createdAt: string;
}

export interface FeedPage {
	/** true cuando el servidor responde `status:"end"`: no hay más historia */
	ended: boolean;
	/** tarjetas crudas vistas, para poder detectar si la página trajo algo */
	cards: number;
	transfers: FeedTransfer[];
	renames: FeedRename[];
}

function toMillis(created: string): number {
	// el feed usa hora local de la liga sin zona; se interpreta como Europe/Madrid
	const parsed = Date.parse(`${created.replace(' ', 'T')}+02:00`);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function managerId(raw: unknown): string | null {
	const id = num(raw);
	return id > 0 ? String(id) : null;
}

export function parseFeedPage(raw: string): FeedPage {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('feed: respuesta no es json (¿x-auth caducado?)');
	}

	const root = asRecord(parsed);
	const status = str(root?.status);
	if (status === 'end') return { ended: true, cards: 0, transfers: [], renames: [] };
	if (status !== 'ok') throw new Error(`feed: status=${status || 'desconocido'}`);

	const cards = Array.isArray(root?.data) ? root.data : [];
	const transfers: FeedTransfer[] = [];
	const renames: FeedRename[] = [];

	for (const rawCard of cards) {
		const card = asRecord(rawCard);
		// las tarjetas separadoras solo llevan {category, date} y no tienen id
		if (!card || card.id === undefined) continue;

		const feedId = num(card.id);
		const createdAt = str(card.created);
		const category = str(card.category);

		if (category === 'change_name') {
			const data = asRecord(card.data);
			if (data) {
				renames.push({
					feedId,
					previousName: str(data.previous_name),
					newName: str(data.new_name),
					createdAt,
				});
			}
			continue;
		}

		// ojo: `player_transfer` son traspasos REALES de laliga (un jugador cambia de
		// club en la vida real). no mueven dinero de nadie y no deben contabilizarse.
		if (category !== 'transfer') continue;

		const entries = Array.isArray(card.data) ? card.data : [];
		for (const rawEntry of entries) {
			const entry = asRecord(rawEntry);
			if (!entry || entry.id === undefined) continue;

			transfers.push({
				feedId,
				transferId: num(entry.id_transfer),
				playerId: String(entry.id),
				playerName: str(entry.name),
				fromManagerId: managerId(entry.id_uc_from),
				toManagerId: managerId(entry.id_uc_to),
				fromName: str(entry.from),
				toName: str(entry.to),
				price: num(entry.price),
				kind: str(entry.type) === 'clause' ? 'clause' : 'market',
				createdAt,
				occurredAt: toMillis(createdAt),
			});
		}
	}

	return { ended: false, cards: cards.length, transfers, renames };
}

export function isSystemManager(name: string): boolean {
	return name === SYSTEM_MANAGER;
}
