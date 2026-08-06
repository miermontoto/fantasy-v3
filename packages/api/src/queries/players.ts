// jugadores y sus snapshots (valor, cláusula, dueño, escudo) en el tiempo.

import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { player, playerSnapshot, clauseChange } from '../db/schema.js';

export type PlayerSnapshotInsert = typeof playerSnapshot.$inferInsert;
export type ClauseChangeInsert = typeof clauseChange.$inferInsert;

export function upsertPlayers(
	rows: { id: string; name: string; position: number; teamId: number | null; photoUrl: string | null }[],
): void {
	if (rows.length === 0) return;
	const db = getDb();
	const now = Date.now();
	db.transaction((tx) => {
		for (const row of rows) {
			tx.insert(player)
				.values({ ...row, createdAt: now })
				.onConflictDoUpdate({
					target: player.id,
					set: { name: row.name, position: row.position, teamId: row.teamId },
				})
				.run();
		}
	});
}

export function insertPlayerSnapshots(rows: PlayerSnapshotInsert[]): void {
	if (rows.length === 0) return;
	const db = getDb();
	db.transaction((tx) => {
		for (const row of rows) tx.insert(playerSnapshot).values(row).run();
	});
}

/** último snapshot conocido de cada jugador con dueño en la comunidad */
export function latestOwnedSnapshots(communityId: string) {
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
	return [...seen.values()].filter((row) => row.ownerId !== null);
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
		for (const row of rows) tx.insert(clauseChange).values(row).run();
	});
}

export function recentClauseChanges(limit = 100) {
	return getDb().select().from(clauseChange).orderBy(desc(clauseChange.ts)).limit(limit).all();
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

/** plantilla de un mánager según el último snapshot de cada jugador */
export function roster(communityId: string, ownerId: string): RosterEntry[] {
	const players = new Map(getDb().select().from(player).all().map((p) => [p.id, p]));

	return latestOwnedSnapshots(communityId)
		.filter((snapshot) => snapshot.ownerId === ownerId)
		.map((snapshot) => {
			const info = players.get(snapshot.playerId);
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
		})
		.sort((a, b) => a.position - b.position || b.value - a.value);
}
