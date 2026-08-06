// fantasy como authorization server oauth 2.1 para clientes mcp.
//
// flujo: dcr (/register) → authorize + consentimiento → token → refresh rotativo.
// el consentimiento reutiliza la sesión del dashboard: si no hay, manda al login
// de oidc y vuelve. PKCE S256 es obligatorio (oauth 2.1, sin secreto de cliente).

import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { MCP_OAUTH, SESSION_COOKIE_NAME } from '../constants.js';
import { sessions } from '../services/auth.js';
import {
	consumeCode,
	getClient,
	issueCode,
	issueTokens,
	markRefreshReplaced,
	registerClient,
	rotateRefreshToken,
	touchClient,
	verifyPkce,
} from '../queries/mcp-oauth.js';

const oauth = new Hono();

/** url pública del servicio, necesaria para las urls canónicas de los metadatos */
export function publicBaseUrl(): string {
	return process.env.PUBLIC_BASE_URL ?? 'https://fantasy.mier.info';
}

/** identificador canónico del recurso protegido: es la audiencia de los tokens */
export function resourceUrl(): string {
	return `${publicBaseUrl()}/mcp`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) =>
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
	);
}

// ===== dynamic client registration (rfc 7591) =====

oauth.post('/register', async (c) => {
	const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return c.json({ error: 'invalid_client_metadata' }, 400);

	const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
	if (redirectUris.length === 0) {
		return c.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris es obligatorio' }, 400);
	}
	// solo http(s) y esquemas propios de cliente nativo; nada de javascript: ni data:
	for (const uri of redirectUris) {
		if (/^(javascript|data|vbscript):/i.test(uri)) {
			return c.json({ error: 'invalid_redirect_uri' }, 400);
		}
	}

	const grantTypes = Array.isArray(body.grant_types)
		? (body.grant_types as string[])
		: ['authorization_code', 'refresh_token'];

	const client = registerClient({
		name: typeof body.client_name === 'string' ? body.client_name : null,
		redirectUris,
		grantTypes,
		// oauth 2.1 con pkce y clientes públicos: sin secreto
		tokenEndpointAuthMethod: 'none',
	});

	return c.json(
		{
			client_id: client.clientId,
			client_id_issued_at: Math.floor(client.createdAt / 1000),
			redirect_uris: redirectUris,
			grant_types: grantTypes,
			token_endpoint_auth_method: 'none',
			client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
		},
		201,
	);
});

// ===== authorize =====

interface AuthorizeParams {
	clientId: string;
	redirectUri: string;
	state: string | null;
	codeChallenge: string;
	codeChallengeMethod: string;
	resource: string | null;
	scope: string;
}

function readParams(c: Context): AuthorizeParams | { error: string } {
	const q = c.req.query();
	if (q.response_type !== 'code') return { error: 'unsupported_response_type' };
	if (!q.client_id) return { error: 'invalid_request: falta client_id' };
	if (!q.redirect_uri) return { error: 'invalid_request: falta redirect_uri' };
	// oauth 2.1: pkce obligatorio, y solo S256
	if (!q.code_challenge) return { error: 'invalid_request: falta code_challenge' };
	if ((q.code_challenge_method ?? 'plain') !== 'S256') return { error: 'invalid_request: se exige S256' };

	const client = getClient(q.client_id);
	if (!client) return { error: 'invalid_client' };
	if (!client.redirectUris.includes(q.redirect_uri)) return { error: 'invalid_redirect_uri' };

	return {
		clientId: q.client_id,
		redirectUri: q.redirect_uri,
		state: q.state ?? null,
		codeChallenge: q.code_challenge,
		codeChallengeMethod: 'S256',
		resource: q.resource ?? null,
		scope: q.scope || MCP_OAUTH.SCOPE,
	};
}

oauth.get('/authorize', (c) => {
	const params = readParams(c);
	if ('error' in params) return c.text(params.error, 400);

	// sin sesión de dashboard no hay a quién pedirle consentimiento: al login
	const token = getCookie(c, SESSION_COOKIE_NAME);
	const session = token ? sessions.validateSession(token) : null;
	if (!session) {
		const back = encodeURIComponent(c.req.url);
		return c.redirect(`/api/auth/login?return_to=${back}`, 302);
	}

	const client = getClient(params.clientId);
	const clientName = escapeHtml(client?.name ?? params.clientId);
	const query = escapeHtml(new URL(c.req.url).search);

	// formulario de consentimiento mínimo: el usuario debe aprobar explícitamente
	return c.html(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>autorizar acceso</title>
<style>body{font-family:system-ui;background:#0a0c0e;color:#e6edf3;display:grid;place-items:center;height:100vh;margin:0}
.card{border:1px solid #232a31;padding:1.5rem;max-width:24rem}
h1{font-size:1rem;margin:0 0 .5rem}p{color:#8b98a5;font-size:.85rem;line-height:1.5}
button{font:inherit;padding:.5rem 1rem;margin-right:.5rem;background:none;border:1px solid #46d17f;color:#46d17f;cursor:pointer}
button.deny{border-color:#8b98a5;color:#8b98a5}</style></head>
<body><div class="card">
<h1>${clientName} quiere acceder a fantasy</h1>
<p>Podrá leer la contabilidad de la liga, las cláusulas y el historial de tu comunidad
en tu nombre (<strong>${escapeHtml(session.user.email)}</strong>).</p>
<form method="post" action="/api/oauth/mcp/authorize/decision${query}">
<button type="submit" name="decision" value="allow">autorizar</button>
<button type="submit" name="decision" value="deny" class="deny">denegar</button>
</form></div></body></html>`);
});

oauth.post('/authorize/decision', async (c) => {
	const params = readParams(c);
	if ('error' in params) return c.text(params.error, 400);

	const token = getCookie(c, SESSION_COOKIE_NAME);
	const session = token ? sessions.validateSession(token) : null;
	if (!session) return c.text('sesión no válida', 401);

	const form = await c.req.parseBody();
	const target = new URL(params.redirectUri);
	if (params.state) target.searchParams.set('state', params.state);

	if (form.decision !== 'allow') {
		target.searchParams.set('error', 'access_denied');
		return c.redirect(target.toString(), 302);
	}

	const code = issueCode({
		userId: session.user.id,
		clientId: params.clientId,
		redirectUri: params.redirectUri,
		codeChallenge: params.codeChallenge,
		codeChallengeMethod: params.codeChallengeMethod,
		// la audiencia queda fijada aquí y viaja hasta el token
		resource: params.resource ?? resourceUrl(),
		scope: params.scope,
	});
	target.searchParams.set('code', code);
	return c.redirect(target.toString(), 302);
});

// ===== token =====

oauth.post('/token', async (c) => {
	const form = (await c.req.parseBody()) as Record<string, string>;
	const grantType = form.grant_type;

	if (grantType === 'authorization_code') {
		const row = consumeCode(form.code ?? '');
		if (!row) return c.json({ error: 'invalid_grant' }, 400);
		if (row.clientId !== form.client_id) return c.json({ error: 'invalid_grant' }, 400);
		if (row.redirectUri !== form.redirect_uri) return c.json({ error: 'invalid_grant' }, 400);
		if (!verifyPkce(form.code_verifier ?? '', row.codeChallenge, row.codeChallengeMethod)) {
			return c.json({ error: 'invalid_grant', error_description: 'pkce no verifica' }, 400);
		}

		touchClient(row.clientId);
		const tokens = issueTokens({
			userId: row.userId,
			clientId: row.clientId,
			scope: row.scope,
			resource: row.resource ?? resourceUrl(),
		});
		return c.json({
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			token_type: 'Bearer',
			expires_in: tokens.expiresIn,
			scope: row.scope,
		});
	}

	if (grantType === 'refresh_token') {
		const previous = form.refresh_token ?? '';
		const row = rotateRefreshToken(previous);
		// null también cubre el replay: rotateRefreshToken ya revocó la cadena
		if (!row) return c.json({ error: 'invalid_grant' }, 400);

		const tokens = issueTokens(row);
		markRefreshReplaced(previous, tokens.refreshToken);
		return c.json({
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			token_type: 'Bearer',
			expires_in: tokens.expiresIn,
			scope: row.scope,
		});
	}

	return c.json({ error: 'unsupported_grant_type' }, 400);
});

export default oauth;
