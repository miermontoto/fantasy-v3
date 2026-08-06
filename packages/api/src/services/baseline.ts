// recálculo del baseline de cada mánager sobre el COSTE de su plantilla.
//
// `200M − valor_de_mercado` subestima lo gastado: en las pujas de inicio de
// temporada se paga prima sobre el valor, y esa prima no aparece por ningún lado.
// el coste real es el PRECIO PAGADO que da el endpoint de detalle. (el suelo de la
// cláusula no sirve: es max(precio, valor), así que se despega del coste en cuanto
// el jugador se revaloriza.)

import { getDb } from '../db/connection.js';
import { manager, community } from '../db/schema.js';
import { latestOwnedSnapshots } from '../queries/players.js';
import { accountableTransfers } from '../queries/transfers.js';
import { eq } from 'drizzle-orm';

export interface BaselineResult {
	managerId: string;
	name: string;
	previous: number | null;
	recomputed: number;
	/** jugadores cuyo coste no se conoce todavía (falta la pasada profunda) */
	unknownCost: number;
}

/**
 * recalcula el cash inicial de cada mánager como
 *   presupuesto − Σ(coste de los jugadores que ya tenía en el baseline)
 * los fichajes posteriores no entran: esos ya los contabiliza el ledger como
 * traspasos, y contarlos aquí sería duplicarlos.
 */
export function recomputeBaselines(communityId: string): BaselineResult[] {
	const db = getDb();
	const [row] = db.select().from(community).where(eq(community.id, communityId)).limit(1).all();
	const budget = row?.startBudget ?? 200_000_000;

	// jugadores adquiridos DESPUÉS del baseline: los aporta el log de traspasos
	const acquiredAfter = new Set(
		accountableTransfers(communityId)
			.filter((t) => t.toManagerId !== null)
			.map((t) => `${t.toManagerId}:${t.playerId}`),
	);

	const costByManager = new Map<string, { cost: number; unknown: number }>();
	for (const snapshot of latestOwnedSnapshots(communityId)) {
		const owner = snapshot.ownerId;
		if (!owner) continue;
		if (acquiredAfter.has(`${owner}:${snapshot.playerId}`)) continue;

		const entry = costByManager.get(owner) ?? { cost: 0, unknown: 0 };
		if (snapshot.purchasePrice) entry.cost += snapshot.purchasePrice;
		else {
			// heredado del reset (nunca fichado) o sin pasada profunda: el valor de
			// mercado es la mejor aproximación disponible
			entry.cost += snapshot.value;
			entry.unknown += 1;
		}
		costByManager.set(owner, entry);
	}

	const results: BaselineResult[] = [];
	for (const m of db.select().from(manager).where(eq(manager.communityId, communityId)).all()) {
		const entry = costByManager.get(m.id);
		if (!entry) continue;
		const recomputed = budget - entry.cost;
		results.push({
			managerId: m.id,
			name: m.name,
			previous: m.initialCash,
			recomputed,
			unknownCost: entry.unknown,
		});
	}
	return results;
}

export function applyBaselines(results: BaselineResult[]): void {
	const db = getDb();
	db.transaction((tx) => {
		for (const r of results) {
			tx.update(manager).set({ initialCash: r.recomputed }).where(eq(manager.id, r.managerId)).run();
		}
	});
}
