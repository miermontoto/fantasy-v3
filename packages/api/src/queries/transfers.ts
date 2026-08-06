// traspasos: la contabilidad de movimientos de dinero entre mánagers.

import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { transfer } from '../db/schema.js';

export type TransferInsert = typeof transfer.$inferInsert;

/**
 * inserta ignorando duplicados por (feedId, playerId). devuelve cuántos eran nuevos.
 * la dedup es imprescindible: el mismo evento del feed se ve en varias pasadas
 * hasta que hace scroll y desaparece.
 */
export function insertTransfers(rows: TransferInsert[]): number {
	if (rows.length === 0) return 0;
	const db = getDb();
	let inserted = 0;
	db.transaction((tx) => {
		for (const row of rows) {
			const result = tx.insert(transfer).values(row).onConflictDoNothing().run();
			if (result.changes > 0) inserted += 1;
		}
	});
	return inserted;
}

export function listTransfers(communityId: string, limit = 200, playerId?: string) {
	const scope = playerId
		? and(eq(transfer.communityId, communityId), eq(transfer.playerId, playerId))
		: eq(transfer.communityId, communityId);

	return getDb()
		.select()
		.from(transfer)
		.where(scope)
		.orderBy(desc(transfer.seenAt))
		.limit(limit)
		.all();
}

/** todos los traspasos que afectan al cash (excluye el baseline ya reflejado) */
export function accountableTransfers(communityId: string) {
	return getDb()
		.select()
		.from(transfer)
		.where(eq(transfer.communityId, communityId))
		.all()
		.filter((row) => !row.baseline);
}

/** true si ya hay una compra registrada de ese jugador por ese mánager */
export function hasBuyFor(playerId: string, managerId: string): boolean {
	const rows = getDb().select().from(transfer).where(eq(transfer.playerId, playerId)).all();
	return rows.some((row) => row.toManagerId === managerId);
}
