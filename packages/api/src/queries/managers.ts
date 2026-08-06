// lecturas y escrituras de mánagers, sus alias y sus snapshots económicos.

import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { manager, managerAlias, managerSnapshot } from '../db/schema.js';

/**
 * resuelve un nombre de mánager a su id, teniendo en cuenta los alias.
 * hace falta porque las tarjetas del feed usan el nombre ACTUAL del equipo
 * mientras la clasificación conserva el original: sin esto un renombre parte
 * la contabilidad en dos identidades.
 */
export function resolveManagerId(communityId: string, name: string): string | null {
	const db = getDb();
	const [alias] = db.select().from(managerAlias).where(eq(managerAlias.alias, name)).limit(1).all();
	if (alias) return alias.managerId;

	const [row] = db
		.select()
		.from(manager)
		.where(and(eq(manager.communityId, communityId), eq(manager.name, name)))
		.limit(1)
		.all();
	return row?.id ?? null;
}

/** alta o actualización de un mánager; devuelve su id */
export function upsertManager(input: {
	id: string;
	communityId: string;
	name: string;
	isSelf?: boolean;
	initialCash?: number;
}): string {
	const db = getDb();
	db.insert(manager)
		.values({
			id: input.id,
			communityId: input.communityId,
			name: input.name,
			isSelf: input.isSelf ?? false,
			initialCash: input.initialCash ?? null,
			createdAt: Date.now(),
		})
		.onConflictDoUpdate({
			target: manager.id,
			set: {
				name: input.name,
				...(input.isSelf !== undefined ? { isSelf: input.isSelf } : {}),
				...(input.initialCash !== undefined ? { initialCash: input.initialCash } : {}),
			},
		})
		.run();
	return input.id;
}

/**
 * registra un renombre visto en el feed (tarjeta `change_name`).
 *
 * el juego avisa de cada cambio de nombre, así que los alias se descubren solos:
 * en v2 había que mantenerlos a mano en ledger.json. devuelve true si el alias
 * era nuevo. si el nombre anterior no corresponde a ningún mánager conocido se
 * ignora: llegará por la clasificación y el siguiente barrido lo recogerá.
 */
export function recordRename(communityId: string, previousName: string, newName: string): boolean {
	const managerId = resolveManagerId(communityId, previousName) ?? resolveManagerId(communityId, newName);
	if (!managerId) return false;

	const db = getDb();
	const [existing] = db.select().from(managerAlias).where(eq(managerAlias.alias, previousName)).limit(1).all();
	addAlias(previousName, managerId);
	// el nombre vigente pasa a ser el canónico de la ficha
	db.update(manager).set({ name: newName }).where(eq(manager.id, managerId)).run();
	return !existing;
}

/** registra un nombre alternativo (renombre de equipo) */
export function addAlias(alias: string, managerId: string): void {
	const db = getDb();
	db.insert(managerAlias)
		.values({ alias, managerId })
		.onConflictDoUpdate({ target: managerAlias.alias, set: { managerId } })
		.run();
}

export function listManagers(communityId: string) {
	return getDb().select().from(manager).where(eq(manager.communityId, communityId)).all();
}

export function getSelfManager(communityId: string) {
	const [row] = getDb()
		.select()
		.from(manager)
		.where(and(eq(manager.communityId, communityId), eq(manager.isSelf, true)))
		.limit(1)
		.all();
	return row ?? null;
}

export function insertManagerSnapshot(input: typeof managerSnapshot.$inferInsert): void {
	getDb().insert(managerSnapshot).values(input).run();
}

/** último snapshot de cada mánager de la comunidad */
export function latestSnapshots(communityId: string) {
	const db = getDb();
	const managers = listManagers(communityId);
	return managers
		.map((m) => {
			const [snapshot] = db
				.select()
				.from(managerSnapshot)
				.where(eq(managerSnapshot.managerId, m.id))
				.orderBy(desc(managerSnapshot.ts))
				.limit(1)
				.all();
			return snapshot ? { manager: m, snapshot } : null;
		})
		.filter((row): row is NonNullable<typeof row> => row !== null);
}

/** serie temporal de un mánager, para los gráficos de evolución */
export function snapshotHistory(managerId: string, sinceTs: number) {
	return getDb()
		.select()
		.from(managerSnapshot)
		.where(and(eq(managerSnapshot.managerId, managerId), gte(managerSnapshot.ts, sinceTs)))
		.orderBy(managerSnapshot.ts)
		.all();
}
