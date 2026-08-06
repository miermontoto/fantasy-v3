// movimientos de saldo del mánager propio: la única fuente exacta de contabilidad.

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { balanceMovement } from '../db/schema.js';
import type { BalanceMovement } from '../scraper/json.js';

/**
 * inserta ignorando duplicados. la clave (ts, reason, amount) es estable: el
 * historial no expone un id propio, pero esa terna no se repite en la práctica.
 */
export function insertBalanceMovements(communityId: string, movements: BalanceMovement[]): number {
	if (movements.length === 0) return 0;
	const db = getDb();
	let inserted = 0;
	db.transaction((tx) => {
		for (const m of movements) {
			const result = tx
				.insert(balanceMovement)
				.values({
					communityId,
					// el historial da segundos epoch; la db guarda milisegundos
					ts: m.ts * 1000,
					type: m.type,
					reason: m.reason,
					amount: m.amount,
					balance: m.balance,
				})
				.onConflictDoNothing()
				.run();
			if (result.changes > 0) inserted += 1;
		}
	});
	return inserted;
}

export function listBalanceMovements(communityId: string, limit = 200) {
	return getDb()
		.select()
		.from(balanceMovement)
		.where(eq(balanceMovement.communityId, communityId))
		.orderBy(desc(balanceMovement.ts))
		.limit(limit)
		.all();
}
