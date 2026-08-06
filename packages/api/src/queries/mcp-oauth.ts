// almacén del authorization server mcp: clientes, codes y tokens.
//
// los secretos nunca se guardan en claro: de code, access y refresh solo se
// persiste el sha256. quien lea la base no puede usar los tokens.

import { and, eq, isNull, lt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db/connection.js';
import { mcpOauthAccessToken, mcpOauthClient, mcpOauthCode, mcpOauthRefreshToken } from '../db/schema.js';
import { MCP_OAUTH } from '../constants.js';

export function hashToken(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

/** verifica un code_verifier PKCE contra el challenge guardado (solo S256) */
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
	if (method !== 'S256') return false;
	const computed = createHash('sha256').update(verifier).digest('base64url');
	// comparación de longitud constante no hace falta: el challenge es público
	return computed === challenge;
}

// ===== clientes (dcr) =====

export function registerClient(input: {
	name: string | null;
	redirectUris: string[];
	grantTypes: string[];
	tokenEndpointAuthMethod: string;
}): { clientId: string; createdAt: number } {
	const clientId = randomToken(16);
	const createdAt = Date.now();
	getDb()
		.insert(mcpOauthClient)
		.values({
			clientId,
			name: input.name,
			redirectUrisJson: JSON.stringify(input.redirectUris),
			grantTypesJson: JSON.stringify(input.grantTypes),
			tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
			createdAt,
		})
		.run();
	return { clientId, createdAt };
}

export function getClient(clientId: string) {
	const [row] = getDb().select().from(mcpOauthClient).where(eq(mcpOauthClient.clientId, clientId)).limit(1).all();
	if (!row) return null;
	return {
		...row,
		redirectUris: JSON.parse(row.redirectUrisJson) as string[],
		grantTypes: JSON.parse(row.grantTypesJson) as string[],
	};
}

export function touchClient(clientId: string): void {
	getDb().update(mcpOauthClient).set({ lastUsedAt: Date.now() }).where(eq(mcpOauthClient.clientId, clientId)).run();
}

// ===== authorization codes =====

export function issueCode(input: {
	userId: number;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	resource: string | null;
	scope: string;
}): string {
	const code = randomToken();
	const now = Date.now();
	getDb()
		.insert(mcpOauthCode)
		.values({
			codeHash: hashToken(code),
			userId: input.userId,
			clientId: input.clientId,
			redirectUri: input.redirectUri,
			codeChallenge: input.codeChallenge,
			codeChallengeMethod: input.codeChallengeMethod,
			resource: input.resource,
			scope: input.scope,
			expiresAt: now + MCP_OAUTH.CODE_TTL_MS,
			createdAt: now,
		})
		.run();
	return code;
}

/** canjea un code de un solo uso; null si no existe, caducó o ya se usó */
export function consumeCode(code: string) {
	const db = getDb();
	const codeHash = hashToken(code);
	const [row] = db.select().from(mcpOauthCode).where(eq(mcpOauthCode.codeHash, codeHash)).limit(1).all();
	if (!row) return null;
	if (row.consumedAt !== null) return null;
	if (row.expiresAt < Date.now()) return null;

	db.update(mcpOauthCode).set({ consumedAt: Date.now() }).where(eq(mcpOauthCode.codeHash, codeHash)).run();
	return row;
}

// ===== tokens =====

export function issueTokens(input: { userId: number; clientId: string; scope: string; resource: string }): {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
} {
	const db = getDb();
	const now = Date.now();
	const accessToken = randomToken();
	const refreshToken = randomToken();

	db.insert(mcpOauthAccessToken)
		.values({
			tokenHash: hashToken(accessToken),
			userId: input.userId,
			clientId: input.clientId,
			scope: input.scope,
			resource: input.resource,
			expiresAt: now + MCP_OAUTH.ACCESS_TTL_MS,
			createdAt: now,
		})
		.run();

	db.insert(mcpOauthRefreshToken)
		.values({
			tokenHash: hashToken(refreshToken),
			userId: input.userId,
			clientId: input.clientId,
			scope: input.scope,
			resource: input.resource,
			expiresAt: now + MCP_OAUTH.REFRESH_TTL_MS,
			createdAt: now,
		})
		.run();

	return { accessToken, refreshToken, expiresIn: Math.floor(MCP_OAUTH.ACCESS_TTL_MS / 1000) };
}

/** valida un access token contra la audiencia esperada */
export function validateAccessToken(token: string, expectedResource: string) {
	const db = getDb();
	const tokenHash = hashToken(token);
	const [row] = db.select().from(mcpOauthAccessToken).where(eq(mcpOauthAccessToken.tokenHash, tokenHash)).limit(1).all();
	if (!row) return null;
	if (row.expiresAt < Date.now()) return null;
	// binding de audiencia: un token emitido para otro recurso no sirve aquí
	if (row.resource !== expectedResource) return null;

	db.update(mcpOauthAccessToken)
		.set({ lastUsedAt: Date.now() })
		.where(eq(mcpOauthAccessToken.tokenHash, tokenHash))
		.run();
	return row;
}

/**
 * rota un refresh token. si llega uno ya rotado es un replay: se revoca toda la
 * cadena del cliente, porque significa que alguien copió el token.
 */
export function rotateRefreshToken(token: string): { userId: number; clientId: string; scope: string; resource: string } | null {
	const db = getDb();
	const tokenHash = hashToken(token);
	const [row] = db.select().from(mcpOauthRefreshToken).where(eq(mcpOauthRefreshToken.tokenHash, tokenHash)).limit(1).all();
	if (!row) return null;

	if (row.replacedByHash !== null || row.revokedAt !== null) {
		revokeClientTokens(row.userId, row.clientId);
		return null;
	}
	if (row.expiresAt < Date.now()) return null;

	return { userId: row.userId, clientId: row.clientId, scope: row.scope, resource: row.resource };
}

export function markRefreshReplaced(oldToken: string, newToken: string): void {
	getDb()
		.update(mcpOauthRefreshToken)
		.set({ replacedByHash: hashToken(newToken) })
		.where(eq(mcpOauthRefreshToken.tokenHash, hashToken(oldToken)))
		.run();
}

export function revokeClientTokens(userId: number, clientId: string): void {
	const db = getDb();
	const now = Date.now();
	db.update(mcpOauthRefreshToken)
		.set({ revokedAt: now })
		.where(and(eq(mcpOauthRefreshToken.userId, userId), eq(mcpOauthRefreshToken.clientId, clientId), isNull(mcpOauthRefreshToken.revokedAt)))
		.run();
	db.delete(mcpOauthAccessToken)
		.where(and(eq(mcpOauthAccessToken.userId, userId), eq(mcpOauthAccessToken.clientId, clientId)))
		.run();
}

/** limpieza periódica de artefactos vencidos */
export function cleanupExpired(): void {
	const db = getDb();
	const now = Date.now();
	db.delete(mcpOauthCode).where(lt(mcpOauthCode.expiresAt, now)).run();
	db.delete(mcpOauthAccessToken).where(lt(mcpOauthAccessToken.expiresAt, now)).run();
	db.delete(mcpOauthRefreshToken).where(lt(mcpOauthRefreshToken.expiresAt, now)).run();
}
