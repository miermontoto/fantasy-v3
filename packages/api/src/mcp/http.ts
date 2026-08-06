// transport http del mcp: json-rpc sobre las mismas tools que stdio.
//
// autenticación por bearer emitido por el authorization server propio
// (routes/oauth-mcp.ts). un 401 devuelve la cabecera WWW-Authenticate con el
// puntero a los metadatos del recurso, que es lo que dispara el descubrimiento
// y el registro dinámico del cliente sin configuración manual.

import { Hono, type Context } from 'hono';
import { dispatch, TOOLS } from './server.js';
import { VERSION } from '../constants.js';
import { validateAccessToken } from '../queries/mcp-oauth.js';
import { publicBaseUrl, resourceUrl } from '../routes/oauth-mcp.js';

const mcp = new Hono();

function unauthorized(c: Context, description?: string): Response {
	const metadata = `${publicBaseUrl()}/.well-known/oauth-protected-resource`;
	c.header(
		'WWW-Authenticate',
		`Bearer resource_metadata="${metadata}"${description ? `, error="invalid_token", error_description="${description}"` : ''}`,
	);
	return c.json({ error: 'unauthorized' }, 401);
}

mcp.use('*', async (c, next) => {
	const header = c.req.header('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : null;
	if (!token) return unauthorized(c);

	const granted = validateAccessToken(token, resourceUrl());
	if (!granted) return unauthorized(c, 'token inválido o caducado');

	await next();
});

interface JsonRpcRequest {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: { name?: string; arguments?: unknown };
}

mcp.get('/', (c) => c.json({ name: 'fantasy', version: VERSION, tools: TOOLS.map((t) => t.name) }));

mcp.post('/', async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as JsonRpcRequest;
	const id = body.id ?? null;

	if (body.method === 'initialize') {
		return c.json({
			jsonrpc: '2.0',
			id,
			result: {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'fantasy', version: VERSION },
			},
		});
	}

	if (body.method === 'tools/list') {
		return c.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
	}

	if (body.method === 'tools/call') {
		const name = body.params?.name;
		if (!name) {
			return c.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'falta params.name' } }, 400);
		}
		try {
			const result = await dispatch(name, body.params?.arguments);
			return c.json({
				jsonrpc: '2.0',
				id,
				result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ jsonrpc: '2.0', id, error: { code: -32000, message } }, 400);
		}
	}

	return c.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `método no soportado: ${body.method}` } }, 400);
});

export default mcp;
