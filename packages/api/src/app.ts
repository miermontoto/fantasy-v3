// composición de la api de fantasy sobre el hono base de @platform/core-api:
// rutas públicas, gate de sesión, rutas de dominio y, al final, la spa estática.

import { createPlatformApp, mountSpa, sessionGate } from '@platform/core-api';
import health from './routes/health.js';
import auth from './routes/auth.js';
import ledger from './routes/ledger.js';
import clauses from './routes/clauses.js';
import players from './routes/players.js';
import sync from './routes/sync.js';
import mcpHttp from './mcp/http.js';
import { sessions, type SessionUser } from './services/auth.js';
import { MCP_TOKEN_HEADER, SESSION_COOKIE_NAME } from './constants.js';

interface AppVariables {
	user: SessionUser;
}

const app = createPlatformApp<{ Variables: AppVariables }>();

// públicas: health para el healthcheck del contenedor, auth para el propio login
app.route('/api/health', health);
app.route('/api/auth', auth);

// el mcp no usa cookies: va con un token estático en cabecera. sin token
// configurado queda cerrado, nunca abierto.
app.use('/mcp/*', async (c, next) => {
	const expected = process.env.MCP_TOKEN;
	if (!expected) return c.json({ error: 'mcp no configurado' }, 503);
	if (c.req.header(MCP_TOKEN_HEADER) !== expected) return c.json({ error: 'no autorizado' }, 401);
	await next();
});
app.route('/mcp', mcpHttp);

// todo lo demás bajo /api exige sesión válida
app.use(
	'/api/*',
	sessionGate<{ Variables: AppVariables }, SessionUser>({
		cookieName: SESSION_COOKIE_NAME,
		validate: (token) => sessions.validateSession(token)?.user ?? null,
		hydrate: async (c, user, next) => {
			c.set('user', user);
			await next();
		},
	}),
);

app.route('/api/ledger', ledger);
app.route('/api/clauses', clauses);
app.route('/api/players', players);
app.route('/api/sync', sync);

// la spa se monta siempre al final: hace fallback de cualquier ruta no-/api a 200.html
mountSpa(app);


export default app;
