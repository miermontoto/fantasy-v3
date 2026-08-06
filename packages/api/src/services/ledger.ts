// contabilidad: estima el cash de cada mánager a partir del baseline y de los
// movimientos observados.
//
// modelo (verificado en 26/27):
//   cash = cash_inicial - comprado + vendido - gasto_en_cláusulas
//   poder_de_puja = max(cash, 0) + 25% del valor de plantilla
//
// el presupuesto inicial es UNIFORME: no hay bonus por referidos. el historial de
// saldo lo parte en "Saldo inicial" + "Ajuste por reinicio", pero la suma es la
// misma para todos. el error del baseline viene solo de capturarlo después del
// reset, cuando los valores de plantilla ya se han movido.
// la fila propia se calibra con /ajax/balance y es exacta.

import { CLAUSE } from '../constants.js';
import { accountableTransfers } from '../queries/transfers.js';
import { latestOwnedSnapshots, recentClauseChanges } from '../queries/players.js';
import { clauseLadderCost, clauseSteps } from '../scraper/json.js';
import { getDb } from '../db/connection.js';
import { manager } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface CashEstimate {
	cash: number;
	spent: number;
	earned: number;
	clauseSpend: number;
	transfers: number;
}

/**
 * gasto neto estimado en subidas de cláusula: coste de los multiplicadores vigentes
 * por encima del base, más la mitad no reembolsada de las bajadas observadas.
 *
 * limitación conocida: las subidas anteriores al seguimiento se valoran al valor
 * ACTUAL del jugador, así que quien subió la cláusula de alguien que después se
 * revalorizó mucho aparece con gasto sobreestimado. los cambios observados desde
 * que hay histórico usan el valor del momento y sí son exactos.
 */
export function estimateClauseSpend(communityId: string, managerId: string): number {
	let spend = 0;

	// último precio pagado por cada jugador: tras una compra la cláusula base es
	// 1.5x el PRECIO pagado, no 1.5x el valor. sin esto, quien pague una prima alta
	// (p.ej. 145M por un jugador de 82M) aparece como si hubiera subido la cláusula.
	const paidFor = new Map<string, number>();
	for (const t of accountableTransfers(communityId)) {
		if (t.toManagerId === managerId) paidFor.set(t.playerId, t.price);
	}

	for (const snapshot of latestOwnedSnapshots(communityId)) {
		if (snapshot.ownerId !== managerId) continue;
		// el suelo mínimo infla el ratio de los baratos: no es inversión del dueño
		if (snapshot.clause === CLAUSE.FLOOR) continue;
		if (!snapshot.clause) continue;
		const floorValue = Math.max(snapshot.value, paidFor.get(snapshot.playerId) ?? 0);
		spend += clauseLadderCost(floorValue, 0, clauseSteps(snapshot.clause, floorValue));
	}

	for (const change of recentClauseChanges(1000)) {
		if (change.kind !== 'clause_down' || change.ownerId !== managerId) continue;
		const value = change.value ?? change.newClause ?? 0;
		if (value <= 0) continue;
		const before = clauseSteps(change.oldClause ?? 0, value);
		const after = clauseSteps(change.newClause ?? 0, value);
		// al bajar se recupera el 50%: la otra mitad es gasto perdido que el
		// snapshot actual ya no refleja
		const removed = clauseLadderCost(value, after, before);
		spend += removed * (1 - CLAUSE.REFUND_PCT);
	}

	return Math.round(spend);
}

/** estimación de cash de un mánager a partir de su baseline y sus movimientos */
export function estimateCash(communityId: string, managerId: string): CashEstimate {
	const db = getDb();
	const [row] = db.select().from(manager).where(eq(manager.id, managerId)).limit(1).all();
	const initial = row?.initialCash ?? 0;

	let spent = 0;
	let earned = 0;
	let count = 0;

	for (const t of accountableTransfers(communityId)) {
		if (t.toManagerId === managerId) {
			spent += t.price;
			count += 1;
		} else if (t.fromManagerId === managerId) {
			earned += t.price;
			count += 1;
		}
	}

	const clauseSpend = estimateClauseSpend(communityId, managerId);
	return { cash: initial - spent + earned - clauseSpend, spent, earned, clauseSpend, transfers: count };
}
