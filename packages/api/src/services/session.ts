// sesión con fantasy marca: mantiene un Browser autenticado y renueva el x-auth.
//
// el refresh-token es de larguísima duración, pero el x-auth por comunidad rota y
// muere al cambiar de temporada. como toda página html embebe el x-auth vigente en
// _FG_cfg, renovarlo es simplemente pedir /feed y releerlo: nunca hace falta que el
// usuario copie un token a mano.

import { eq } from 'drizzle-orm';
import { Browser, ScrapeError } from '../scraper/browser.js';
import { parseSessionInfo, type SessionInfo } from '../scraper/html.js';
import { getDb } from '../db/connection.js';
import { authToken, community } from '../db/schema.js';

let cached: { browser: Browser; session: SessionInfo } | null = null;

function refreshToken(): string {
	const token = process.env.FANTASY_REFRESH_TOKEN;
	if (!token) throw new Error('falta FANTASY_REFRESH_TOKEN en el entorno');
	return token;
}

/** true si hay credenciales configuradas; los pollers lo consultan antes de correr */
export function isConfigured(): boolean {
	return Boolean(process.env.FANTASY_REFRESH_TOKEN);
}

/** pide /feed y extrae el x-auth y la comunidad activa; persiste ambos */
export async function renewSession(): Promise<SessionInfo> {
	const anon = new Browser({ refreshToken: refreshToken() });
	const html = await anon.feed();
	const session = parseSessionInfo(html);
	if (!session) throw new ScrapeError('no se pudo extraer _FG_cfg', '/feed');

	const db = getDb();
	const now = Date.now();

	db.insert(community)
		.values({ id: session.communityId, name: '', isActive: true, createdAt: now })
		.onConflictDoUpdate({ target: community.id, set: { isActive: true } })
		.run();

	db.insert(authToken)
		.values({ communityId: session.communityId, xauth: session.auth, updatedAt: now })
		.onConflictDoUpdate({ target: authToken.communityId, set: { xauth: session.auth, updatedAt: now } })
		.run();

	cached = { browser: new Browser({ refreshToken: refreshToken(), xauth: session.auth }), session };
	return session;
}

/** browser autenticado, renovando la sesión la primera vez o cuando se pide */
export async function getBrowser(force = false): Promise<Browser> {
	if (!force && cached) return cached.browser;
	if (!cached) {
		// reutilizar el x-auth persistido evita una petición extra en cada arranque
		const db = getDb();
		const [row] = db.select().from(authToken).limit(1).all();
		if (row && !force) {
			cached = {
				browser: new Browser({ refreshToken: refreshToken(), xauth: row.xauth }),
				session: { auth: row.xauth, communityId: row.communityId, season: '', balance: null, selfManagerId: null },
			};
			return cached.browser;
		}
	}
	await renewSession();
	return cached!.browser;
}

/** id_uc del mánager propio en la comunidad activa; null si aún no se ha leído */
export async function getSelfManagerId(): Promise<string | null> {
	if (cached?.session.selfManagerId) return cached.session.selfManagerId;
	return (await renewSession()).selfManagerId;
}

export async function getCommunityId(): Promise<string> {
	if (cached) return cached.session.communityId;
	const db = getDb();
	const [row] = db.select().from(community).where(eq(community.isActive, true)).limit(1).all();
	if (row) return row.id;
	return (await renewSession()).communityId;
}

/**
 * ejecuta una operación con el browser y, si el x-auth ha caducado, renueva y
 * reintenta una vez. es el patrón que evita tener un poller dedicado a la auth.
 */
export async function withSession<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await getBrowser();
	try {
		return await fn(browser);
	} catch (err) {
		if (!(err instanceof ScrapeError)) throw err;
		// x-auth caducado o rotado: renovar y reintentar exactamente una vez
		const renewed = await getBrowser(true);
		return await fn(renewed);
	}
}
