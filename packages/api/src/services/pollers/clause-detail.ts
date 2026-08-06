// pasada profunda de cláusulas: para cada jugador con dueño consulta el detalle y
// guarda el SUELO y el MULTIPLICADOR reales.
//
// hace falta porque el listado solo da la cláusula en euros, y `cláusula / valor`
// NO es el multiplicador: el suelo es max(precio pagado, valor actual), así que ese
// ratio se mueve solo con el mercado. deducir subidas de cláusula a partir de él
// cobraba a los mánagers subidas que nunca hicieron (a Mourinheiro le imputaba 8.5M
// teniendo todos sus jugadores en el 1.5 por defecto).
//
// de paso guarda el PRECIO PAGADO, que es el coste real de la plantilla y la única
// forma de calcular un baseline sin sesgo (el valor de mercado ignora la prima).
//
// es cara (una petición por jugador), así que corre con menos frecuencia.

import type { Poller } from '../poller-runner.js';
import { POLL_INTERVAL } from '../../constants.js';
import { parsePlayerCommunityInfo } from '../../scraper/json.js';
import { getCommunityId, isConfigured, withSession } from '../session.js';
import { applyClauseDetails, latestOwnedSnapshots, type ClauseDetailUpdate } from '../../queries/players.js';

/**
 * cada cuántos jugadores se vuelca lo acumulado. escribir al final del todo
 * perdería la pasada entera si falla la petición 150 de 182, y escribir fila a
 * fila era justo lo que preparaba un statement por jugador.
 */
const FLUSH_EVERY = 50;

export const clauseDetailPoller: Poller = {
	name: 'clause-detail',
	intervalMs: POLL_INTERVAL.CLAUSE_DETAIL,
	enabled: isConfigured,

	async runOnce() {
		const communityId = await getCommunityId();
		const owned = latestOwnedSnapshots(communityId);
		let updated = 0;
		let pending: ClauseDetailUpdate[] = [];

		const flush = () => {
			updated += applyClauseDetails(pending);
			pending = [];
		};

		for (const snapshot of owned) {
			const raw = await withSession((browser) => browser.playerCommunityInfo(snapshot.playerId));
			const info = parsePlayerCommunityInfo(raw);
			if (!info) continue;

			const floor = info.clausePercentage > 0 ? Math.round(info.clauseValue / (1 + info.clausePercentage / 100)) : null;
			pending.push({
				snapshotId: snapshot.id,
				clauseFloor: floor,
				// percentage 50 → multiplicador 1.5
				clauseMultiplierReal: 1 + info.clausePercentage / 100,
				purchasePrice: info.purchasePrice,
				purchaseDate: info.purchaseDate,
			});
			if (pending.length >= FLUSH_EVERY) flush();
		}
		flush();

		console.log(`[poller:clause-detail] ${updated}/${owned.length} jugadores con suelo y multiplicador reales`);
	},
};
