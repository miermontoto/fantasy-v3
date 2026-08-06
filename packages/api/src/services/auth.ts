// sesiones del dashboard sobre @platform/auth.
//
// la app es de uso personal: no hay registro abierto. solo entran los correos
// listados en ALLOWED_EMAILS, y la cuenta se crea en el primer login válido.

import { createSessionService } from '@platform/auth';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { appUser, authSession } from '../db/schema.js';
import { SESSION_TTL_MS } from '../constants.js';

export interface SessionUser {
	id: number;
	email: string;
	name: string | null;
}

export const sessions = createSessionService<SessionUser, number, Record<string, unknown>>({
	getDb: () => getDb() as never,
	table: authSession,
	ttlMs: SESSION_TTL_MS,
	// sliding: el uso diario del dashboard no debería obligar a re-loguear
	sliding: true,
	resolveUser: (userId) => {
		const [row] = getDb().select().from(appUser).where(eq(appUser.id, userId)).limit(1).all();
		return row ? { id: row.id, email: row.email, name: row.name } : null;
	},
});

/** correos autorizados; sin la variable no entra nadie (fail closed) */
export function allowedEmails(): string[] {
	return (process.env.ALLOWED_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
}

export function isAllowed(email: string): boolean {
	return allowedEmails().includes(email.toLowerCase());
}

/** resuelve la cuenta por correo, creándola si es la primera vez */
export function resolveUser(email: string, name?: string): SessionUser | null {
	if (!isAllowed(email)) return null;

	const db = getDb();
	const normalized = email.toLowerCase();
	const now = Date.now();

	const [existing] = db.select().from(appUser).where(eq(appUser.email, normalized)).limit(1).all();
	if (existing) {
		db.update(appUser).set({ lastSeenAt: now }).where(eq(appUser.id, existing.id)).run();
		return { id: existing.id, email: existing.email, name: existing.name };
	}

	const [created] = db
		.insert(appUser)
		.values({ email: normalized, name: name ?? null, createdAt: now, lastSeenAt: now })
		.returning()
		.all();
	return created ? { id: created.id, email: created.email, name: created.name } : null;
}
