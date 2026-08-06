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

/**
 * inserta o corrige traspasos venidos del feed json.
 *
 * a diferencia de `insertTransfers`, pisa los campos de los que el feed es la
 * fuente autoritativa. hace falta para sanear lo que escribieron versiones
 * anteriores: las tarjetas html no daban `occurredAt` ni ids numéricos de mánager,
 * y sin fecha no se puede saber qué es anterior al reset ni deshacer un traspaso.
 * `seenAt` no se toca: es cuándo lo vimos por primera vez.
 */
export function upsertFeedTransfers(rows: TransferInsert[]): {
	inserted: number;
	updated: number;
} {
	if (rows.length === 0) return { inserted: 0, updated: 0 };
	const db = getDb();
	let inserted = 0;
	let updated = 0;
	db.transaction((tx) => {
		for (const row of rows) {
			const existing = tx
				.select()
				.from(transfer)
				.where(and(eq(transfer.feedId, row.feedId), eq(transfer.playerId, row.playerId)))
				.limit(1)
				.all();

			if (existing.length === 0) {
				tx.insert(transfer).values(row).run();
				inserted += 1;
				continue;
			}

			tx.update(transfer)
				.set({
					playerName: row.playerName,
					fromManagerId: row.fromManagerId,
					toManagerId: row.toManagerId,
					price: row.price,
					kind: row.kind,
					source: row.source,
					occurredAt: row.occurredAt,
					baseline: row.baseline,
				})
				.where(and(eq(transfer.feedId, row.feedId), eq(transfer.playerId, row.playerId)))
				.run();
			updated += 1;
		}
	});
	return { inserted, updated };
}

/**
 * registra un traspaso a precio 0 entre dos mánagers (un regalo).
 *
 * el juego permite ceder un jugador gratis y NO publica tarjeta en el feed, así que
 * es el único movimiento de plantilla que no se descubre solo. no mueve dinero, pero
 * sí importa para el baseline: sin él, el jugador se le atribuye en el reset a quien
 * lo tiene hoy en vez de a quien lo regaló, y el saldo inicial de ambos sale mal.
 *
 * el feedId es sintético y negativo para no chocar nunca con uno real.
 */
export function recordGift(input: {
	communityId: string;
	playerId: string;
	playerName: string;
	fromManagerId: string;
	toManagerId: string;
	occurredAt: number;
}): boolean {
	const db = getDb();
	const feedId = -Number(input.playerId);
	const existing = db
		.select()
		.from(transfer)
		.where(and(eq(transfer.feedId, feedId), eq(transfer.playerId, input.playerId)))
		.limit(1)
		.all();
	if (existing.length > 0) return false;

	db.insert(transfer)
		.values({
			communityId: input.communityId,
			feedId,
			playerId: input.playerId,
			playerName: input.playerName,
			fromManagerId: input.fromManagerId,
			toManagerId: input.toManagerId,
			price: 0,
			kind: 'gift',
			source: 'manual',
			occurredAt: input.occurredAt,
			seenAt: Date.now(),
		})
		.run();
	return true;
}

/**
 * borra los traspasos de otras fuentes que el feed ya cubre.
 *
 * cuando se creía que el feed perdía eventos había que rellenar huecos por otras
 * vías (reconciliación por detalle de jugador, importación de v2), y esas filas
 * llevaban un feedId sintético. ahora que el feed es completo son duplicados que
 * inflan las compras: el mismo fichaje contado dos veces. el feed manda porque es
 * el único con precio e ids exactos (v2 llegó a redondear un precio por parsear html).
 */
export function pruneSupersededTransfers(communityId: string): number {
	const db = getDb();
	const rows = db.select().from(transfer).where(eq(transfer.communityId, communityId)).all();
	const coveredByFeed = new Set(rows.filter((r) => r.source === 'feed').map((r) => r.playerId));

	// los regalos se anotan a mano precisamente porque el feed NO los publica: que
	// el jugador tenga otros eventos en el feed no los hace redundantes
	const superseded = rows.filter((r) => r.source !== 'feed' && r.source !== 'manual' && coveredByFeed.has(r.playerId));
	if (superseded.length === 0) return 0;

	db.transaction((tx) => {
		for (const row of superseded) tx.delete(transfer).where(eq(transfer.id, row.id)).run();
	});
	return superseded.length;
}

export function listTransfers(communityId: string, limit = 200, playerId?: string) {
	const scope = playerId
		? and(eq(transfer.communityId, communityId), eq(transfer.playerId, playerId))
		: eq(transfer.communityId, communityId);

	return getDb().select().from(transfer).where(scope).orderBy(desc(transfer.seenAt)).limit(limit).all();
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
