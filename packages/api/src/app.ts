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
import oauthMcp from './routes/oauth-mcp.js';
import wellKnown from './routes/well-known.js';
import { sessions, type SessionUser } from './services/auth.js';
import { SESSION_COOKIE_NAME } from './constants.js';

interface AppVariables {
	user: SessionUser;
}

const app = createPlatformApp<{ Variables: AppVariables }>();

// públicas: health para el healthcheck del contenedor, auth para el propio login
app.route('/api/health', health);
app.route('/api/auth', auth);

// descubrimiento oauth: público por definición, es lo que permite a un cliente
// mcp registrarse solo (rfc 9728 + rfc 8414)
app.route('/.well-known', wellKnown);

// authorization server del mcp: /register y /token son públicos por el estándar;
// /authorize exige sesión de dashboard para pedir el consentimiento
app.route('/api/oauth/mcp', oauthMcp);

// el recurso protegido: bearer propio, no la cookie del dashboard
app.route('/mcp', mcpHttp);

// todo lo demás bajo /api exige sesión válida
app.use(
	'/api/*',
	sessionGate<{ Variables: AppVariables }, SessionUser>({
		cookieName: SESSION_COOKIE_NAME,
		// el authorization server del mcp se gestiona solo: /authorize ya comprueba
		// la sesión por su cuenta y /register + /token son públicos por estándar
		isPreAuth: (path) => path.startsWith('/api/oauth/mcp'),
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
