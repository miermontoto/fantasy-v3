// jugadores: ficha con su serie temporal de valor y cláusula.
import { Hono } from 'hono';
import { getPlayer, playerHistory } from '../queries/players.js';

const players = new Hono();

players.get('/:id', (c) => {
	const id = c.req.param('id');
	const info = getPlayer(id);
	if (!info) return c.json({ error: 'jugador desconocido' }, 404);

	const days = Number(c.req.query('days') ?? 30);
	const since = Date.now() - days * 24 * 60 * 60 * 1000;

	const history = playerHistory(id, since).map((row) => ({
		ts: row.ts,
		value: row.value,
		clause: row.clause,
		clauseMultiplier: row.clauseMultiplier,
		ownerId: row.ownerId,
		shield: row.shield,
	}));

	return c.json({ player: info, history });
});

export default players;
