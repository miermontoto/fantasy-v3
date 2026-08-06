// anclas de saldo: registran el cash real de un mánager en un instante.
//
// no son una calibración a ciegas: el baseline `200M − valor` está sesgado por la
// prima pagada en las pujas previas a su captura, y ese sesgo no se puede recuperar
// a posteriori porque las plantillas ya han rotado. un ancla corta el error
// acumulado y deja que la estimación siga solo con movimientos observados.
import { Hono } from 'hono';
import { z } from 'zod';
import { addAnchor, listAnchors } from '../queries/anchors.js';

const anchors = new Hono();

const bodySchema = z.object({
	managerId: z.string(),
	cash: z.number(),
	source: z.enum(['api', 'disclosed']).default('disclosed'),
	note: z.string().optional(),
});

anchors.get('/', (c) => c.json({ anchors: listAnchors() }));

anchors.post('/', async (c) => {
	const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: 'payload inválido', detail: parsed.error.issues }, 400);
	addAnchor(parsed.data);
	return c.json({ ok: true, anchor: parsed.data }, 201);
});

export default anchors;
