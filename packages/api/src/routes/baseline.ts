// recálculo exacto del saldo inicial. dry-run por defecto: sin ?apply=true solo
// enseña la corrección que aplicaría.
//
// es una operación CARA (una petición por jugador de todas las plantillas del
// reset). se ejecuta a mano tras un reset de liga, no periódicamente.
import { Hono } from 'hono';
import { getCommunityId } from '../services/session.js';
import { applyBaselines, recomputeBaselines } from '../services/baseline.js';

const baseline = new Hono();

baseline.post('/recompute', async (c) => {
	const communityId = await getCommunityId();
	const report = await recomputeBaselines(communityId);
	const apply = c.req.query('apply') === 'true';
	const applied = apply ? applyBaselines(report.results) : 0;

	return c.json({
		valuedOn: report.valuedOn,
		playersFetched: report.playersFetched,
		applied,
		managers: report.results
			.map((r) => ({
				...r,
				delta: r.previous === null ? null : r.recomputed - r.previous,
			}))
			.sort((a, b) => b.recomputed - a.recomputed),
	});
});

export default baseline;
