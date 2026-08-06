// anclas de saldo: puntos en los que se conoce el cash real de un mánager.

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { cashAnchor } from '../db/schema.js';

export function addAnchor(input: {
	managerId: string;
	cash: number;
	source: 'api' | 'disclosed';
	ts?: number;
	note?: string;
}): void {
	getDb()
		.insert(cashAnchor)
		.values({
			managerId: input.managerId,
			ts: input.ts ?? Date.now(),
			cash: input.cash,
			source: input.source,
			note: input.note ?? null,
		})
		.run();
}

/** ancla más reciente de un mánager, si la hay */
export function latestAnchor(managerId: string) {
	const [row] = getDb()
		.select()
		.from(cashAnchor)
		.where(eq(cashAnchor.managerId, managerId))
		.orderBy(desc(cashAnchor.ts))
		.limit(1)
		.all();
	return row ?? null;
}

export function listAnchors() {
	return getDb().select().from(cashAnchor).orderBy(desc(cashAnchor.ts)).all();
}
