// reconstrucción EXACTA del `Saldo inicial` de cada mánager.
//
// la regla del juego es `saldo_inicial = presupuesto − valor de la plantilla el día
// del reset`. el problema nunca fue la fórmula sino no poder valorar una plantilla
// en el pasado. dos hallazgos lo resuelven:
//
//   1. el feed pagina hasta el principio, así que se conoce TODO traspaso posterior
//      al reset. deshaciéndolos sobre la plantilla de hoy sale la plantilla exacta
//      que cada mánager tenía en el reset (incluidos los jugadores que ya vendió).
//   2. el detalle de jugador trae `values_chart` con 366 valores diarios, así que
//      esa plantilla se puede valorar al día del reset sin aproximar nada.
//
// verificado contra los dos saldos reales conocidos (el propio, vía /ajax/balance,
// y el declarado por un rival): delta de 0 € en ambos.
//
// esto sustituye al enfoque anterior por coste de adquisición, que era irrecuperable
// hacia atrás: valoraba solo la plantilla de HOY y se dejaba fuera a los jugadores
// vendidos desde el reset, con lo que erraba incluso de signo.

import { spanishDay, parseValueHistory } from '../scraper/json.js';
import { getDb } from '../db/connection.js';
import { community, manager } from '../db/schema.js';
import { latestOwnedSnapshots } from '../queries/players.js';
import { accountableTransfers } from '../queries/transfers.js';
import { withSession } from './session.js';
import { getResetAt } from './ledger.js';
import { eq } from 'drizzle-orm';

export interface BaselineResult {
	managerId: string;
	name: string;
	previous: number | null;
	recomputed: number;
	squadSize: number;
	squadValue: number;
	/** jugadores de la plantilla del reset sin serie de valores: error residual */
	missingValues: number;
}

export interface BaselineReport {
	/** día del reset en la etiqueta del juego, p.ej. "1 ago 2026" */
	valuedOn: string;
	playersFetched: number;
	results: BaselineResult[];
	/**
	 * mánagers con menos jugadores que la mayoría en el reset. en el reset todos
	 * reciben la misma cantidad, así que quedarse corto significa que falta un
	 * jugador por atribuir: casi siempre un regalo sin registrar (`kind = 'gift'`)
	 * o alguien que se fue de laliga. su saldo inicial sale ALTO, y con él su cash.
	 */
	shortRosters: { managerId: string; name: string; squadSize: number }[];
	/** tamaño de plantilla más repetido en el reset: la referencia de la liga */
	expectedSquadSize: number;
}

/**
 * plantilla de cada mánager en el instante del reset.
 *
 * parte de la plantilla actual y deshace hacia atrás cada traspaso posterior: quien
 * compró pierde al jugador, quien vendió lo recupera. como el feed es completo, el
 * resultado es la composición exacta, no una aproximación.
 */
export function reconstructResetRosters(communityId: string, resetAt: number): Map<string, Set<string>> {
	const post = accountableTransfers(communityId)
		.filter((t) => (t.occurredAt ?? 0) >= resetAt)
		.sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));

	// un mánager puede REGALAR un jugador a otro: el traspaso existe y mueve la
	// plantilla, pero es de precio 0 y el feed no lo publica. si está registrado
	// (`kind = 'gift'`), deshacerlo devuelve al jugador a quien lo regaló, que es
	// quien de verdad lo tenía en el reset.
	const explained = new Set(post.map((t) => t.playerId));

	const rosters = new Map<string, Set<string>>();
	for (const snapshot of latestOwnedSnapshots(communityId)) {
		if (!snapshot.ownerId) continue;
		// precio de compra 0 sin traspaso que lo explique: llegó gratis y no se sabe
		// de quién, así que no se le puede atribuir a nadie en el reset. dejarlo en la
		// plantilla del que lo tiene HOY le inflaría la plantilla y le rebajaría el
		// saldo inicial. queda como hueco, y lo delata `shortRosters`.
		if (snapshot.purchasePrice === 0 && !explained.has(snapshot.playerId)) continue;
		const squad = rosters.get(snapshot.ownerId) ?? new Set<string>();
		squad.add(snapshot.playerId);
		rosters.set(snapshot.ownerId, squad);
	}

	for (const t of post) {
		if (t.toManagerId) rosters.get(t.toManagerId)?.delete(t.playerId);
		if (t.fromManagerId) {
			const squad = rosters.get(t.fromManagerId) ?? new Set<string>();
			squad.add(t.playerId);
			rosters.set(t.fromManagerId, squad);
		}
	}

	return rosters;
}

/**
 * recalcula el saldo inicial de todos los mánagers.
 *
 * CARO: una petición de detalle por jugador distinto de todas las plantillas del
 * reset (~180 en una liga de 12). está pensado para ejecutarse a mano tras un reset
 * de liga, no en un poller.
 */
export async function recomputeBaselines(communityId: string): Promise<BaselineReport> {
	const db = getDb();
	const resetAt = getResetAt(communityId);
	if (resetAt === null) {
		throw new Error('sin instante de reset: hace falta el historial de balance propio');
	}

	const [row] = db.select().from(community).where(eq(community.id, communityId)).limit(1).all();
	const budget = row?.startBudget ?? 200_000_000;
	const valuedOn = spanishDay(new Date(resetAt));

	const rosters = reconstructResetRosters(communityId, resetAt);
	const playerIds = [...new Set([...rosters.values()].flatMap((squad) => [...squad]))];

	// una petición por jugador; el valor del día del reset sale de su serie diaria
	const valueOnReset = new Map<string, number>();
	for (const playerId of playerIds) {
		const details = await withSession((browser) => browser.playerDetails(playerId));
		const value = parseValueHistory(details).get(valuedOn);
		if (value !== undefined) valueOnReset.set(playerId, value);
	}

	const results: BaselineResult[] = [];
	for (const m of db.select().from(manager).where(eq(manager.communityId, communityId)).all()) {
		const squad = rosters.get(m.id);
		if (!squad) continue;

		let squadValue = 0;
		let missingValues = 0;
		for (const playerId of squad) {
			const value = valueOnReset.get(playerId);
			if (value === undefined) missingValues += 1;
			else squadValue += value;
		}

		results.push({
			managerId: m.id,
			name: m.name,
			previous: m.initialCash,
			recomputed: budget - squadValue,
			squadSize: squad.size,
			squadValue,
			missingValues,
		});
	}

	// en el reset todos reciben la misma cantidad de jugadores, así que la moda es
	// la referencia y quien baje de ahí tiene un hueco sin atribuir
	const sizes = results.map((r) => r.squadSize);
	const tally = new Map<number, number>();
	for (const size of sizes) tally.set(size, (tally.get(size) ?? 0) + 1);
	const expectedSquadSize = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;

	const shortRosters = results
		.filter((r) => r.squadSize < expectedSquadSize)
		.map((r) => ({ managerId: r.managerId, name: r.name, squadSize: r.squadSize }));

	return { valuedOn, playersFetched: valueOnReset.size, results, shortRosters, expectedSquadSize };
}

/**
 * persiste los saldos recalculados. solo se aplican las filas completas: una
 * plantilla con jugadores sin valorar daría un saldo inflado, y es preferible
 * conservar el anterior a escribir uno que se sabe mal.
 */
export function applyBaselines(results: BaselineResult[]): number {
	const db = getDb();
	let applied = 0;
	db.transaction((tx) => {
		for (const r of results) {
			if (r.missingValues > 0) continue;
			tx.update(manager).set({ initialCash: r.recomputed }).where(eq(manager.id, r.managerId)).run();
			applied += 1;
		}
	});
	return applied;
}
