// transport http del mcp. expone las mismas tools que stdio sobre json-rpc.
//
// implementación mínima y sin estado: cada petición se resuelve contra el mismo
// dispatch, sin sesiones ni transporte con estado. suficiente para un cliente
// local o un túnel privado; si algún día se abre a internet hará falta auth.

import { Hono } from 'hono';
import { dispatch, TOOLS } from './server.js';
import { VERSION } from '../constants.js';

const mcp = new Hono();

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
