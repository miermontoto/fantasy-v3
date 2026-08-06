// contabilidad: estima el cash de cada mánager a partir del baseline y de los
// movimientos observados.
//
// modelo (verificado en 26/27):
//   cash = cash_inicial - comprado + vendido - gasto_en_cláusulas
//   poder_de_puja = max(0, cash + 25% del valor de plantilla)
//
// el presupuesto inicial es UNIFORME: no hay bonus por referidos. lo que cambia
// entre mánagers es el valor de la plantilla que les tocó en el reset.
//
// el saldo inicial NO se estima: se reconstruye exacto en services/baseline.ts a
// partir de la plantilla del reset (feed completo) valorada con la serie diaria de
// valores. contrastado con los dos saldos reales conocidos, delta de 0 €.
//
// la fila propia se calibra además con /ajax/balance en cada pasada.

import { CLAUSE } from '../constants.js';
import { latestAnchor } from '../queries/anchors.js';
import { accountableTransfers } from '../queries/transfers.js';
import { latestClauseDetails, latestOwnedSnapshots, recentClauseChanges } from '../queries/players.js';
import { clauseLadderCost, clauseSteps } from '../scraper/json.js';
import { getDb } from '../db/connection.js';
import { balanceMovement, manager } from '../db/schema.js';
import { and, desc, eq } from 'drizzle-orm';

/** tipo de movimiento con el que el juego apunta el saldo inicial y su ajuste */
const BONUS_MOVEMENT = 'Bonificación';

/**
 * instante del último reset de liga, leído del historial de balance propio.
 *
 * el juego lo marca con movimientos de tipo `Bonificación` ("Saldo inicial" y
 * "Ajuste de balance por reinicio de liga"): el último de ellos es el momento en
 * que se fijaron los saldos. hace falta porque el feed NO se corta ahí, sigue
 * arrastrando la cola de la temporada anterior, cuyos traspasos no cuentan.
 */
export function getResetAt(communityId: string): number | null {
	const [row] = getDb()
		.select()
		.from(balanceMovement)
		.where(and(eq(balanceMovement.communityId, communityId), eq(balanceMovement.type, BONUS_MOVEMENT)))
		.orderBy(desc(balanceMovement.ts))
		.limit(1)
		.all();
	return row?.ts ?? null;
}

export interface CashEstimate {
	cash: number;
	spent: number;
	earned: number;
	clauseSpend: number;
	transfers: number;
	/** instante del ancla usada, si la hay: marca desde cuándo es fiable */
	anchoredAt?: number | null;
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
export function estimateClauseSpend(communityId: string, managerId: string, sinceTs = 0): number {
	let spend = 0;

	// con ancla solo cuentan las subidas OBSERVADAS después: las anteriores ya
	// están descontadas del saldo que el mánager declaró
	if (sinceTs > 0) {
		for (const change of recentClauseChanges(1000)) {
			if (change.ownerId !== managerId || change.ts <= sinceTs) continue;
			const value = change.value ?? 0;
			if (value <= 0) continue;
			const before = clauseSteps(change.oldClause ?? 0, value);
			const after = clauseSteps(change.newClause ?? 0, value);
			if (change.kind === 'clause_up') spend += clauseLadderCost(value, before, after);
			// bajar reembolsa la mitad: el coste neto es la mitad de lo retirado
			if (change.kind === 'clause_down') {
				spend += clauseLadderCost(value, after, before) * (1 - CLAUSE.REFUND_PCT);
			}
		}
		return Math.round(spend);
	}

	// multiplicadores reales, de la última fila que los traiga por jugador
	const details = latestClauseDetails(communityId);

	// último precio pagado por cada jugador: tras una compra la cláusula base es
	// 1.5x el PRECIO pagado, no 1.5x el valor. sin esto, quien pague una prima alta
	// (p.ej. 145M por un jugador de 82M) aparece como si hubiera subido la cláusula.
	const paidFor = new Map<string, number>();
	for (const t of accountableTransfers(communityId)) {
		if (t.toManagerId === managerId) paidFor.set(t.playerId, t.price);
	}

	for (const snapshot of latestOwnedSnapshots(communityId)) {
		if (snapshot.ownerId !== managerId) continue;
		if (!snapshot.clause) continue;

		// el multiplicador REAL solo lo da el endpoint de detalle. sin él no se puede
		// saber si la cláusula está subida: `cláusula / valor` se mueve solo con el
		// mercado porque el suelo es el precio pagado y está congelado. sin dato
		// fiable no se imputa nada: es preferible subestimar a inventar gasto.
		//
		// se busca en la última fila que TRAIGA multiplicador, no en la más reciente:
		// el barrido de cláusulas escribe la liga entera sin ese campo y taparía a
		// las filas enriquecidas del poller de detalle.
		const detail = details.get(snapshot.playerId);
		if (!detail || detail.ownerId !== snapshot.ownerId) continue;

		const multiplier = detail.clauseMultiplierReal;
		if (multiplier === null || multiplier <= CLAUSE.BASE_MULTIPLIER) continue;

		// el escalón se paga sobre el suelo, que es el precio pagado
		const base = detail.clauseFloor ?? paidFor.get(snapshot.playerId) ?? snapshot.value;
		const steps = (multiplier - CLAUSE.BASE_MULTIPLIER) / CLAUSE.STEP_SIZE;
		spend += clauseLadderCost(base, 0, steps);
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

/**
 * estimación de cash de un mánager.
 *
 * si hay un ancla (saldo real conocido en un instante) se parte de ahí y solo se
 * aplican los movimientos posteriores, con lo que el error acumulado desde el
 * reset desaparece. sin ancla se parte del baseline como siempre.
 */
export function estimateCash(communityId: string, managerId: string): CashEstimate {
	const db = getDb();
	const [row] = db.select().from(manager).where(eq(manager.id, managerId)).limit(1).all();

	const anchor = latestAnchor(managerId);
	const base = anchor ? anchor.cash : (row?.initialCash ?? 0);
	const since = anchor?.ts ?? 0;

	let spent = 0;
	let earned = 0;
	let count = 0;

	for (const t of accountableTransfers(communityId)) {
		// con ancla, lo anterior a ella ya está reflejado en el saldo declarado.
		// se compara contra CUÁNDO OCURRIÓ, no cuándo lo vimos: desde que el feed se
		// pagina hacia atrás se registran eventos de hace días, y filtrar por seenAt
		// los colaba después del ancla y los contaba dos veces
		if ((t.occurredAt ?? t.seenAt) <= since) continue;
		if (t.toManagerId === managerId) {
			spent += t.price;
			count += 1;
		} else if (t.fromManagerId === managerId) {
			earned += t.price;
			count += 1;
		}
	}

	const clauseSpend = estimateClauseSpend(communityId, managerId, since);
	return {
		cash: base - spent + earned - clauseSpend,
		spent,
		earned,
		clauseSpend,
		transfers: count,
		anchoredAt: anchor?.ts ?? null,
	};
}
