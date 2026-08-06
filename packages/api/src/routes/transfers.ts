// alta manual de traspasos que el juego no publica en el feed.
//
// hoy solo los regalos: ceder un jugador gratis a otro mánager no genera tarjeta,
// así que es el único movimiento de plantilla que no se descubre solo. no mueve
// dinero, pero sin registrarlo el baseline se lo atribuye en el reset a quien lo
// tiene HOY en vez de a quien lo regaló.
import { Hono } from 'hono';
import { z } from 'zod';
import { getCommunityId } from '../services/session.js';
import { recordGift } from '../queries/transfers.js';
import { getPlayer } from '../queries/players.js';

const transfers = new Hono();

const giftSchema = z.object({
	playerId: z.string(),
	fromManagerId: z.string(),
	toManagerId: z.string(),
	/** cuándo se cedió; en iso. debe ser posterior al reset para que cuente */
	at: z.string(),
});

transfers.post('/gift', async (c) => {
	const parsed = giftSchema.safeParse(await c.req.json());
	if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

	const { playerId, fromManagerId, toManagerId, at } = parsed.data;
	const occurredAt = Date.parse(at);
	if (Number.isNaN(occurredAt)) return c.json({ error: 'fecha inválida' }, 400);

	const player = getPlayer(playerId);
	if (!player) return c.json({ error: 'jugador desconocido' }, 404);

	const created = recordGift({
		communityId: await getCommunityId(),
		playerId,
		playerName: player.name,
		fromManagerId,
		toManagerId,
		occurredAt,
	});

	// recordar que el baseline no se recalcula solo: hay que pedirlo aparte
	return c.json({ created, playerId, playerName: player.name, occurredAt });
});

export default transfers;
