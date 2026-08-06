// login vía oidc contra id.mier.info, igual que sis y duckhunt.
// el estado del flujo (state/verifier/nonce) viaja en una cookie corta acotada
// al callback; la sesión resultante es la de @platform/auth.

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createOidcClient } from '@platform/oidc-rp';
import { resolveUser, sessions } from '../services/auth.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../constants.js';

const STATE_COOKIE = 'fantasy_oidc';
const STATE_PATH = '/api/auth';

const isProd = (): boolean => process.env.NODE_ENV === 'production';

export function oidcConfigured(): boolean {
	return Boolean(process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);
}

const client = createOidcClient({
	issuer: process.env.OIDC_ISSUER ?? 'https://id.mier.info',
	clientId: process.env.OIDC_CLIENT_ID ?? '',
	clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
	redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
});

const auth = new Hono();

auth.get('/me', (c) => {
	const token = getCookie(c, SESSION_COOKIE_NAME);
	const session = token ? sessions.validateSession(token) : null;
	if (!session) return c.json({ authenticated: false }, 401);
	return c.json({ authenticated: true, user: session.user });
});

auth.get('/login', async (c) => {
	if (!oidcConfigured()) return c.json({ error: 'oidc no configurado' }, 503);

	const start = await client.beginLogin();
	setCookie(c, STATE_COOKIE, JSON.stringify({ s: start.state, v: start.codeVerifier, n: start.nonce }), {
		path: STATE_PATH,
		httpOnly: true,
		sameSite: 'Lax',
		secure: isProd(),
		maxAge: 600,
	});
	return c.redirect(start.url, 302);
});

auth.get('/callback', async (c) => {
	const raw = getCookie(c, STATE_COOKIE);
	deleteCookie(c, STATE_COOKIE, { path: STATE_PATH });

	const fail = (reason: string) => c.redirect(`/login?error=${encodeURIComponent(reason)}`, 302);
	if (!raw) return fail('sesión de login perdida');

	let saved: { s: string; v: string; n: string };
	try {
		saved = JSON.parse(raw) as { s: string; v: string; n: string };
	} catch {
		return fail('estado inválido');
	}

	try {
		const claims = await client.completeLogin({
			code: c.req.query('code') ?? '',
			state: c.req.query('state') ?? '',
			expectedState: saved.s,
			codeVerifier: saved.v,
			nonce: saved.n,
		});

		if (!claims.email) return fail('el proveedor no devolvió email');

		const user = resolveUser(claims.email, claims.name ?? undefined);
		// fail closed: un correo no autorizado no crea cuenta ni sesión
		if (!user) return fail('cuenta no autorizada');

		const session = sessions.createSession(user.id, c.req.header('user-agent'));
		setCookie(c, SESSION_COOKIE_NAME, session.token, {
			httpOnly: true,
			sameSite: 'Lax',
			secure: isProd(),
			path: '/',
			maxAge: Math.floor(SESSION_TTL_MS / 1000),
		});
		return c.redirect('/', 302);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'fallo en el login');
	}
});

auth.post('/logout', (c) => {
	const token = getCookie(c, SESSION_COOKIE_NAME);
	if (token) sessions.deleteSession(token);
	deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
	return c.json({ ok: true });
});

export default auth;
