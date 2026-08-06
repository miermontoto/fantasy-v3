// poller del feed: ingiere los traspasos que mueven dinero.
//
// v2 asumía que el feed hacía scroll y perdía eventos para siempre, y pagaba por
// ello (dos traspasos recuperados a mano). era falso: `POST /ajax/feed` pagina la
// historia completa y responde `status:"end"` al acabarse. una temporada entera
// cabe en ~12 páginas, así que no hay nada irrecuperable.
//
// se usa el json y no las tarjetas html porque trae `id_uc_from`/`id_uc_to`
// numéricos: la contabilidad deja de depender de casar nombres de equipo, que es
// lo que obligaba a mantener el mapa de alias cuando alguien se renombraba.
//
// no captura sus errores: el runner necesita verlos para aplicar backoff.

import type { Poller } from '../poller-runner.js';
import { FEED_CARDS_PER_PAGE, FEED_MAX_PAGES, POLL_INTERVAL } from '../../constants.js';
import { parseFeedPage, type FeedRename, type FeedTransfer } from '../../scraper/feed.js';
import { getCommunityId, isConfigured, withSession } from '../session.js';
import { pruneSupersededTransfers, upsertFeedTransfers, type TransferInsert } from '../../queries/transfers.js';
import { recordRename } from '../../queries/managers.js';
import { getResetAt } from '../ledger.js';

export interface FeedSyncResult {
	pages: number;
	events: number;
	inserted: number;
	/** filas ya existentes cuyos datos se han corregido con el json */
	updated: number;
	renames: number;
	/** duplicados de otras fuentes eliminados al confirmar la historia completa */
	pruned: number;
	/** true si se llegó al final real del feed (`status:"end"`) */
	reachedEnd: boolean;
}

/**
 * recorre el feed hacia atrás e inserta lo que falte.
 *
 * en modo incremental para cuando una página entera no aporta nada nuevo: en
 * régimen normal eso ocurre en la primera o segunda. `full` fuerza el barrido
 * completo hasta el final, que es lo que hay que hacer al reconstruir la historia.
 */
export async function syncFeed(options: { full?: boolean } = {}): Promise<FeedSyncResult> {
	const communityId = await getCommunityId();
	const resetAt = getResetAt(communityId);
	const now = Date.now();

	let pages = 0;
	let events = 0;
	let inserted = 0;
	let updated = 0;
	let reachedEnd = false;
	const pendingRenames: FeedRename[] = [];

	for (let page = 0; page < FEED_MAX_PAGES; page += 1) {
		const raw = await withSession((browser) => browser.feedPage(page * FEED_CARDS_PER_PAGE));
		const parsed = parseFeedPage(raw);
		pages += 1;

		if (parsed.ended || parsed.cards === 0) {
			reachedEnd = true;
			break;
		}

		pendingRenames.push(...parsed.renames);

		events += parsed.transfers.length;
		const result = upsertFeedTransfers(parsed.transfers.map((event) => toRow(communityId, event, resetAt, now)));
		inserted += result.inserted;
		updated += result.updated;

		// en incremental, una página sin altas significa que a partir de aquí todo
		// está ya registrado: el feed solo crece por delante
		if (!options.full && result.inserted === 0 && parsed.transfers.length > 0) break;
	}

	// el feed se recorre de lo más nuevo a lo más viejo, así que los renombres hay
	// que aplicarlos al revés: si no, el nombre que acaba ganando es el más antiguo
	pendingRenames.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	const renames = applyRenames(communityId, pendingRenames);

	// solo tras confirmar el final del feed se sabe que la historia está completa y
	// que lo que venga de otras fuentes es redundante
	const pruned = reachedEnd ? pruneSupersededTransfers(communityId) : 0;

	return { pages, events, inserted, updated, renames, pruned, reachedEnd };
}

function toRow(communityId: string, event: FeedTransfer, resetAt: number | null, now: number): TransferInsert {
	return {
		communityId,
		feedId: event.feedId,
		playerId: event.playerId,
		playerName: event.playerName,
		fromManagerId: event.fromManagerId,
		toManagerId: event.toManagerId,
		price: event.price,
		kind: event.kind,
		source: 'feed',
		occurredAt: event.occurredAt,
		seenAt: now,
		// el feed NO se corta en el reset de liga: arrastra la cola de la temporada
		// anterior, cuyos movimientos no tienen nada que ver con el saldo actual
		baseline: resetAt !== null && event.occurredAt < resetAt,
	};
}

function applyRenames(communityId: string, list: FeedRename[]): number {
	let count = 0;
	for (const rename of list) {
		if (!rename.previousName || !rename.newName) continue;
		if (recordRename(communityId, rename.previousName, rename.newName)) count += 1;
	}
	return count;
}

export const feedPoller: Poller = {
	name: 'feed',
	intervalMs: POLL_INTERVAL.FEED,
	enabled: isConfigured,

	async runOnce() {
		const result = await syncFeed();
		if (result.inserted > 0 || result.renames > 0) {
			console.log(
				`[poller:feed] ${result.inserted} traspasos nuevos y ${result.renames} renombres en ${result.pages} páginas`,
			);
		}
	},
};
