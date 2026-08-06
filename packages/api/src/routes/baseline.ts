// recálculo del baseline sobre coste. dry-run por defecto: sin ?apply=true solo
// enseña la corrección que aplicaría.
import { Hono } from 'hono';
import { getCommunityId } from '../services/session.js';
import { applyBaselines, recomputeBaselines } from '../services/baseline.js';

const baseline = new Hono();

baseline.post('/recompute', async (c) => {
	const communityId = await getCommunityId();
	const results = recomputeBaselines(communityId);
	const apply = c.req.query('apply') === 'true';
	if (apply) applyBaselines(results);

	return c.json({
		applied: apply,
		managers: results.map((r) => ({
			...r,
			delta: r.previous === null ? null : r.recomputed - r.previous,
		})),
	});
});

export default baseline;
