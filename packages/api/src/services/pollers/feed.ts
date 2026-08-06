// poller del feed: ingiere los traspasos de las tarjetas card-transfer.
//
// es el poller crítico del sistema. los eventos del feed hacen scroll y desaparecen
// sin dejar rastro consultable: en v2, sincronizar una vez al día perdió dos
// traspasos que hubo que recuperar a mano. de ahí el intervalo de 15 minutos.
//
// no captura sus errores: el runner necesita verlos para aplicar backoff.

import type { Poller } from '../poller-runner.js';
import { POLL_INTERVAL, SYSTEM_MANAGER } from '../../constants.js';
import { parseFeedTransfers } from '../../scraper/html.js';
import { getCommunityId, isConfigured, withSession } from '../session.js';
import { insertTransfers, type TransferInsert } from '../../queries/transfers.js';
import { resolveManagerId } from '../../queries/managers.js';

export const feedPoller: Poller = {
	name: 'feed',
	intervalMs: POLL_INTERVAL.FEED,
	enabled: isConfigured,

	async runOnce() {
		const communityId = await getCommunityId();
		const html = await withSession((browser) => browser.feed());
		const events = parseFeedTransfers(html);
		const now = Date.now();

		const rows: TransferInsert[] = events.map((event) => ({
			communityId,
			feedId: event.feedId,
			playerId: event.playerId,
			playerName: event.playerName,
			fromManagerId: event.from ? resolveManagerId(communityId, event.from) : null,
			toManagerId: event.to ? resolveManagerId(communityId, event.to) : null,
			price: event.price,
			// un traspaso entre dos mánagers sin pasar por el mercado es un clausulazo
			kind: event.from && event.to ? 'clause' : 'market',
			source: 'feed',
			seenAt: now,
		}));

		const inserted = insertTransfers(rows);
		if (inserted > 0) {
			console.log(`[poller:feed] ${inserted} traspasos nuevos de ${events.length} visibles`);
		}
	},
};

/** nombres que aparecen en el feed y no son mánagers reales */
export function isSystemManager(name: string): boolean {
	return name === SYSTEM_MANAGER;
}
