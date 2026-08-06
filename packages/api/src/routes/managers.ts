// mánagers: listado y visor de plantillas (propia y rivales).
import { Hono } from 'hono';
import { getCommunityId } from '../services/session.js';
import { listManagers } from '../queries/managers.js';
import { roster } from '../queries/players.js';

const managers = new Hono();

managers.get('/', async (c) => {
	const communityId = await getCommunityId();
	return c.json({ managers: listManagers(communityId) });
});

/**
 * plantilla de la liga entera: es lo que sustituye al tablero de cláusulas.
 * se declara antes que /:id/roster porque hono resuelve por orden de registro.
 */
managers.get('/roster', async (c) => {
	const communityId = await getCommunityId();
	return c.json({ players: roster(communityId) });
});

managers.get('/:id/roster', async (c) => {
	const communityId = await getCommunityId();
	return c.json({ players: roster(communityId, c.req.param('id')) });
});

export default managers;
