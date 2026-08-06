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

import { eq } from 'drizzle-orm';
import type { Poller } from '../poller-runner.js';
import { POLL_INTERVAL } from '../../constants.js';
import { parsePlayerCommunityInfo } from '../../scraper/json.js';
import { getCommunityId, isConfigured, withSession } from '../session.js';
import { latestOwnedSnapshots } from '../../queries/players.js';
import { getDb } from '../../db/connection.js';
import { playerSnapshot } from '../../db/schema.js';

export const clauseDetailPoller: Poller = {
	name: 'clause-detail',
	intervalMs: POLL_INTERVAL.CLAUSE_DETAIL,
	enabled: isConfigured,

	async runOnce() {
		const communityId = await getCommunityId();
		const db = getDb();
		const owned = latestOwnedSnapshots(communityId);
		let updated = 0;

		for (const snapshot of owned) {
			const raw = await withSession((browser) => browser.playerCommunityInfo(snapshot.playerId));
			const info = parsePlayerCommunityInfo(raw);
			if (!info) continue;

			const floor = info.clausePercentage > 0 ? Math.round(info.clauseValue / (1 + info.clausePercentage / 100)) : null;
			db.update(playerSnapshot)
				.set({
					clauseFloor: floor,
					// percentage 50 → multiplicador 1.5
					clauseMultiplierReal: 1 + info.clausePercentage / 100,
					purchasePrice: info.purchasePrice,
					purchaseDate: info.purchaseDate,
				})
				.where(eq(playerSnapshot.id, snapshot.id))
				.run();
			updated += 1;
		}

		console.log(`[poller:clause-detail] ${updated}/${owned.length} jugadores con suelo y multiplicador reales`);
	},
};
