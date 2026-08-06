// inteligencia de cláusulas: objetivos de robo y exposición propia.
//
// una cláusula se puede pagar siempre que no haya escudo activo, así que el ratio
// cláusula/valor mide lo cara que sale una compra forzada respecto a lo que vale
// el jugador. cuanto más bajo, mejor objetivo.

import { CLAUSE } from '../constants.js';
import { latestOwnedSnapshots, recentClauseChanges } from '../queries/players.js';
import { getDb } from '../db/connection.js';
import { manager, player } from '../db/schema.js';

export interface StealTarget {
	playerId: string;
	name: string;
	position: number;
	ownerId: string | null;
	ownerName: string;
	value: number;
	clause: number;
	/** cláusula / valor: cuanto más bajo, más barato sale el robo */
	ratio: number;
	/** true si la cláusula está en el suelo de 1M y el ratio no es informativo */
	atFloor: boolean;
	shielded: boolean;
	listed: boolean;
	/** true si el poder de puja indicado cubre la cláusula */
	affordable: boolean;
	/** true si el jugador es del propio mánager (exposición, no objetivo) */
	isOwn: boolean;
}

export interface StealTargetOptions {
	communityId: string;
	/** filtra por dueño (id) */
	ownerId?: string;
	/** presupuesto disponible para marcar affordable */
	budget?: number;
	/** excluye a los que tienen escudo activo */
	hideShielded?: boolean;
	/** id del mánager propio: sus jugadores se marcan y se pueden excluir */
	selfId?: string | null;
	/** deja fuera a los jugadores propios */
	excludeOwn?: boolean;
	limit?: number;
}

/** objetivos de robo ordenados por ratio ascendente */
export function stealTargets(options: StealTargetOptions): StealTarget[] {
	const db = getDb();
	const names = new Map(db.select().from(manager).all().map((m) => [m.id, m.name]));
	const players = new Map(db.select().from(player).all().map((p) => [p.id, p]));

	const targets: StealTarget[] = [];
	for (const snapshot of latestOwnedSnapshots(options.communityId)) {
		if (options.ownerId && snapshot.ownerId !== options.ownerId) continue;
		if (options.hideShielded && snapshot.shield !== 0) continue;

		const clause = snapshot.clause ?? 0;
		if (clause <= 0) continue;

		const info = players.get(snapshot.playerId);
		const atFloor = clause === CLAUSE.FLOOR;
		const isOwn = options.selfId !== undefined && snapshot.ownerId === options.selfId;
		if (options.excludeOwn && isOwn) continue;

		targets.push({
			isOwn,
			playerId: snapshot.playerId,
			name: info?.name ?? snapshot.playerId,
			position: info?.position ?? 0,
			ownerId: snapshot.ownerId,
			ownerName: snapshot.ownerId ? (names.get(snapshot.ownerId) ?? snapshot.ownerId) : 'Libre',
			value: snapshot.value,
			clause,
			ratio: snapshot.value > 0 ? clause / snapshot.value : Number.POSITIVE_INFINITY,
			atFloor,
			shielded: snapshot.shield !== 0,
			listed: snapshot.listed,
			affordable: options.budget !== undefined ? clause <= options.budget : false,
		});
	}

	// con toda la liga en el multiplicador por defecto el ratio no discrimina, así
	// que si hay presupuesto lo que manda es qué se puede pagar de verdad; dentro de
	// cada grupo, ratio ascendente y a igualdad la cláusula más barata primero.
	// los que están en el suelo van al final: su ratio alto es un artefacto.
	targets.sort((a, b) => {
		if (a.atFloor !== b.atFloor) return a.atFloor ? 1 : -1;
		if (options.budget !== undefined && a.affordable !== b.affordable) return a.affordable ? -1 : 1;
		if (Math.abs(a.ratio - b.ratio) > 0.01) return a.ratio - b.ratio;
		return a.clause - b.clause;
	});

	return options.limit ? targets.slice(0, options.limit) : targets;
}

export interface ClauseChangeView {
	playerId: string;
	name: string;
	kind: string;
	ownerName: string | null;
	prevOwnerName: string | null;
	oldClause: number | null;
	newClause: number | null;
	ts: number;
}

/** últimos cambios de cláusula con los nombres ya resueltos */
export function recentChanges(limit = 100): ClauseChangeView[] {
	const db = getDb();
	const names = new Map(db.select().from(manager).all().map((m) => [m.id, m.name]));
	const players = new Map(db.select().from(player).all().map((p) => [p.id, p.name]));

	return recentClauseChanges(limit).map((change) => ({
		playerId: change.playerId,
		name: players.get(change.playerId) ?? change.playerId,
		kind: change.kind,
		ownerName: change.ownerId ? (names.get(change.ownerId) ?? change.ownerId) : null,
		prevOwnerName: change.prevOwnerId ? (names.get(change.prevOwnerId) ?? change.prevOwnerId) : null,
		oldClause: change.oldClause,
		newClause: change.newClause,
		ts: change.ts,
	}));
}
