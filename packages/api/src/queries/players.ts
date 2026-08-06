// jugadores y sus snapshots (valor, cláusula, dueño, escudo) en el tiempo.

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { player, playerSnapshot, clauseChange } from '../db/schema.js';

export type PlayerSnapshotInsert = typeof playerSnapshot.$inferInsert;
export type ClauseChangeInsert = typeof clauseChange.$inferInsert;

/**
 * inserción por lotes. una sentencia por fila hacía que drizzle preparase un
 * statement nuevo en cada vuelta: al pasar el poller a barrer la liga entera
 * (~511 jugadores) eso son más de mil statements por pasada, y finalizarlos
 * reventaba el binding nativo de better-sqlite3 dentro del contenedor
 * (`RemoveEnvironmentCleanupHook`, env nulo). agrupando, son unas pocas.
 *
 * el tamaño acota el número de variables por sentencia muy por debajo del
 * límite de sqlite: la tabla más ancha tiene 19 columnas y 19 × 50 = 950.
 */
const INSERT_CHUNK = 50;

function* chunked<T>(rows: T[], size: number): Generator<T[]> {
	for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

export function upsertPlayers(
	rows: { id: string; name: string; position: number; teamId: number | null; photoUrl: string | null }[],
): void {
	if (rows.length === 0) return;
	const db = getDb();
	const now = Date.now();
	db.transaction((tx) => {
		for (const chunk of chunked(rows, INSERT_CHUNK)) {
			tx.insert(player)
				.values(chunk.map((row) => ({ ...row, createdAt: now })))
				.onConflictDoUpdate({
					target: player.id,
					// `excluded` es la fila que se intentaba insertar: con inserción por
					// lotes no se puede referenciar el valor concreto de cada fila.
					// photoUrl se deja fuera a propósito, como antes: el listado no
					// siempre la trae y pisarla con null borraría la que ya teníamos.
					set: {
						name: sql`excluded.name`,
						position: sql`excluded.position`,
						teamId: sql`excluded.team_id`,
					},
				})
				.run();
		}
	});
}

export function insertPlayerSnapshots(rows: PlayerSnapshotInsert[]): void {
	if (rows.length === 0) return;
	const db = getDb();
	db.transaction((tx) => {
		for (const chunk of chunked(rows, INSERT_CHUNK)) tx.insert(playerSnapshot).values(chunk).run();
	});
}

/**
 * último snapshot conocido de cada jugador de la comunidad, tenga dueño o no.
 * incluye a los agentes libres: no se pueden robar por cláusula, pero son la
 * otra mitad del mercado y el visor tiene que poder enseñarlos.
 */
export function latestSnapshots(communityId: string) {
	const db = getDb();
	// una sola pasada por el índice (player_id, ts) descendente: la primera fila
	// de cada jugador es su estado actual
	const rows = db
		.select()
		.from(playerSnapshot)
		.where(eq(playerSnapshot.communityId, communityId))
		.orderBy(desc(playerSnapshot.ts))
		.all();

	const seen = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		if (!seen.has(row.playerId)) seen.set(row.playerId, row);
	}
	return [...seen.values()];
}

/**
 * solo los jugadores con dueño. es la base de todo lo que cuenta dinero (valor
 * de plantilla, baseline, objetivos de cláusula): un agente libre no pertenece a
 * ninguna plantilla y contarlo inflaría los patrimonios.
 */
export function latestOwnedSnapshots(communityId: string) {
	return latestSnapshots(communityId).filter((row) => row.ownerId !== null);
}

/** serie temporal de un jugador: alimenta los gráficos de valor y cláusula */
export function playerHistory(playerId: string, sinceTs: number) {
	return getDb()
		.select()
		.from(playerSnapshot)
		.where(and(eq(playerSnapshot.playerId, playerId), gte(playerSnapshot.ts, sinceTs)))
		.orderBy(playerSnapshot.ts)
		.all();
}

export function insertClauseChanges(rows: ClauseChangeInsert[]): void {
	if (rows.length === 0) return;
	const db = getDb();
	db.transaction((tx) => {
		for (const chunk of chunked(rows, INSERT_CHUNK)) tx.insert(clauseChange).values(chunk).run();
	});
}

export function recentClauseChanges(limit = 100, playerId?: string) {
	const query = getDb().select().from(clauseChange);
	return (playerId ? query.where(eq(clauseChange.playerId, playerId)) : query)
		.orderBy(desc(clauseChange.ts))
		.limit(limit)
		.all();
}

export function getPlayer(playerId: string) {
	const [row] = getDb().select().from(player).where(eq(player.id, playerId)).limit(1).all();
	return row ?? null;
}

export interface RosterEntry {
	playerId: string;
	name: string;
	position: number;
	photoUrl: string | null;
	value: number;
	prevValue: number | null;
	points: number;
	average: number;
	clause: number | null;
	clauseMultiplier: number | null;
	shield: number;
	listed: boolean;
	clausesRank: number | null;
	status: string | null;
	streak: (number | null)[];
	ownerId: string | null;
}

/**
 * proyecta un snapshot a la entrada que consume la tarjeta de jugador. es el
 * único sitio donde se decide qué campos forman una tarjeta: plantillas, feed de
 * actividad y ficha comparten esta forma para que la ui no tenga dos anatomías.
 */
function toRosterEntry(
	snapshot: typeof playerSnapshot.$inferSelect,
	info: typeof player.$inferSelect | undefined,
): RosterEntry {
	return {
		playerId: snapshot.playerId,
		name: info?.name ?? snapshot.playerId,
		position: info?.position ?? 0,
		photoUrl: info?.photoUrl ?? null,
		value: snapshot.value,
		prevValue: snapshot.prevValue,
		points: snapshot.points,
		average: snapshot.average,
		clause: snapshot.clause,
		clauseMultiplier: snapshot.clauseMultiplier,
		shield: snapshot.shield,
		listed: snapshot.listed,
		clausesRank: snapshot.clausesRank,
		status: snapshot.status,
		streak: snapshot.streakJson ? (JSON.parse(snapshot.streakJson) as (number | null)[]) : [],
		ownerId: snapshot.ownerId,
	};
}

/**
 * plantilla según el último snapshot de cada jugador. sin `ownerId` devuelve la
 * liga entera, que es como se buscan objetivos de cláusula sin tablero aparte.
 */
export function roster(communityId: string, ownerId?: string | null): RosterEntry[] {
	const players = new Map(getDb().select().from(player).all().map((p) => [p.id, p]));
	// sin dueño concreto se devuelve la liga entera INCLUIDOS los agentes libres:
	// lo que se puede fichar no es solo lo que ya tiene dueño
	const snapshots = ownerId ? latestOwnedSnapshots(communityId) : latestSnapshots(communityId);

	return snapshots
		.filter((snapshot) => !ownerId || snapshot.ownerId === ownerId)
		.map((snapshot) => toRosterEntry(snapshot, players.get(snapshot.playerId)))
		.sort((a, b) => a.position - b.position || b.value - a.value);
}

/**
 * último snapshot de los jugadores indicados, tengan dueño o no. el feed de
 * actividad lo necesita así: un jugador liberado sigue teniendo que renderizar
 * su tarjeta aunque ya no esté en ninguna plantilla.
 */
export function playerCards(playerIds: string[]): Map<string, RosterEntry> {
	if (playerIds.length === 0) return new Map();
	const db = getDb();
	const unique = [...new Set(playerIds)];

	const players = new Map(
		db.select().from(player).where(inArray(player.id, unique)).all().map((p) => [p.id, p]),
	);
	const rows = db
		.select()
		.from(playerSnapshot)
		.where(inArray(playerSnapshot.playerId, unique))
		.orderBy(desc(playerSnapshot.ts))
		.all();

	const cards = new Map<string, RosterEntry>();
	for (const row of rows) {
		if (cards.has(row.playerId)) continue;
		cards.set(row.playerId, toRosterEntry(row, players.get(row.playerId)));
	}
	return cards;
}
