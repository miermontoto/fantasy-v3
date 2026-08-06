// actividad: feed unificado de traspasos y cambios de cláusula.
import { Hono } from 'hono';
import { getCommunityId } from '../services/session.js';
import { recentActivity } from '../services/activity.js';

const activity = new Hono();

/** GET /?limit=&player= */
activity.get('/', async (c) => {
	const communityId = await getCommunityId();
	const limit = Number(c.req.query('limit') ?? 60);
	return c.json({
		events: recentActivity({ communityId, limit, playerId: c.req.query('player') ?? undefined }),
	});
});

export default activity;
