// contabilidad de la liga: cash estimado y poder de puja por mánager.
import { Hono } from 'hono';
import { getCommunityId } from '../services/session.js';
import { latestSnapshots, snapshotHistory } from '../queries/managers.js';
import { listTransfers } from '../queries/transfers.js';
import { listBalanceMovements } from '../queries/balance.js';

const ledger = new Hono();

/** tabla actual, ordenada por poder de puja (el ranking de amenaza real) */
ledger.get('/', async (c) => {
	const communityId = await getCommunityId();
	const managers = latestSnapshots(communityId)
		.map(({ manager, snapshot }) => ({
			managerId: manager.id,
			name: manager.name,
			isSelf: manager.isSelf,
			cash: snapshot.cash,
			teamValue: snapshot.teamValue,
			maxBid: snapshot.maxBid,
			clauseSpend: snapshot.clauseSpend,
			pendingBids: snapshot.pendingBids,
			remainingNow: snapshot.remainingNow,
			exact: snapshot.exact,
			points: snapshot.points,
			position: snapshot.position,
			ts: snapshot.ts,
		}))
		.sort((a, b) => b.maxBid - a.maxBid);

	return c.json({ communityId, managers });
});

/** serie temporal de un mánager para los gráficos de evolución */
ledger.get('/history/:managerId', (c) => {
	const days = Number(c.req.query('days') ?? 30);
	const since = Date.now() - days * 24 * 60 * 60 * 1000;
	const history = snapshotHistory(c.req.param('managerId'), since).map((row) => ({
		ts: row.ts,
		cash: row.cash,
		teamValue: row.teamValue,
		maxBid: row.maxBid,
	}));
	return c.json({ history });
});

ledger.get('/transfers', async (c) => {
	const communityId = await getCommunityId();
	const limit = Number(c.req.query('limit') ?? 200);
	return c.json({ transfers: listTransfers(communityId, limit) });
});

/** movimientos exactos del mánager propio */
ledger.get('/movements', async (c) => {
	const communityId = await getCommunityId();
	const limit = Number(c.req.query('limit') ?? 200);
	return c.json({ movements: listBalanceMovements(communityId, limit) });
});

export default ledger;
