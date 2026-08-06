// cláusulas: objetivos de robo y registro de cambios.
import { Hono } from 'hono';
import { getCommunityId, getSelfManagerId } from '../services/session.js';
import { recentChanges, stealTargets } from '../services/clauses.js';

const clauses = new Hono();

/** GET /?owner=&budget=&hideShielded=true&limit= */
clauses.get('/', async (c) => {
	const communityId = await getCommunityId();
	const budgetParam = c.req.query('budget');

	const targets = stealTargets({
		communityId,
		selfId: await getSelfManagerId(),
		excludeOwn: c.req.query('excludeOwn') === 'true',
		ownerId: c.req.query('owner') ?? undefined,
		budget: budgetParam ? Number(budgetParam) : undefined,
		hideShielded: c.req.query('hideShielded') === 'true',
		limit: Number(c.req.query('limit') ?? 100),
	});

	return c.json({ targets });
});

clauses.get('/changes', (c) => {
	return c.json({ changes: recentChanges(Number(c.req.query('limit') ?? 100)) });
});

export default clauses;
