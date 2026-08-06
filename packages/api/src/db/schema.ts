// esquema canónico de fantasy v3.
//
// la diferencia clave con v2 (ficheros json sobrescritos) es que aquí todo lo que
// cambia con el tiempo se guarda como snapshot append-only: valores, cláusulas y
// cash rival quedan como series temporales consultables, no como "el estado de hoy".

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { defineSessionTable } from '@platform/auth';

// ===== comunidad y sesión =====

/** una comunidad (liga) de fantasy marca. la app puede seguir varias. */
export const community = sqliteTable('community', {
	id: text('id').primaryKey(), // id de fantasy marca
	name: text('name').notNull(),
	competitionId: integer('competition_id'),
	/** presupuesto inicial de la liga; no siempre son 200M (hay bonus por referidos) */
	startBudget: integer('start_budget').notNull().default(200_000_000),
	/** fecha del último reset: el baseline del ledger solo es válido justo después */
	resetAt: integer('reset_at'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at').notNull(),
});

/** tokens de autenticación: refresh (largo) y x-auth por comunidad (rota) */
export const authToken = sqliteTable('auth_token', {
	communityId: text('community_id').primaryKey(),
	xauth: text('xauth').notNull(),
	updatedAt: integer('updated_at').notNull(),
});

// ===== mánagers =====

export const manager = sqliteTable(
	'manager',
	{
		id: text('id').primaryKey(), // id_uc de fantasy marca
		communityId: text('community_id')
			.notNull()
			.references(() => community.id),
		name: text('name').notNull(),
		/** true para el mánager propio: su fila se calibra con el saldo real */
		isSelf: integer('is_self', { mode: 'boolean' }).notNull().default(false),
		/** cash inicial observado en el baseline (presupuesto - valor de plantilla) */
		initialCash: integer('initial_cash'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('manager_community_idx').on(t.communityId)],
);

/**
 * nombres alternativos de un mánager. las tarjetas del feed usan el nombre ACTUAL
 * del equipo mientras la clasificación conserva el original: sin esto un renombre
 * parte la contabilidad en dos identidades.
 */
export const managerAlias = sqliteTable(
	'manager_alias',
	{
		alias: text('alias').primaryKey(),
		managerId: text('manager_id')
			.notNull()
			.references(() => manager.id),
	},
	(t) => [index('manager_alias_manager_idx').on(t.managerId)],
);

/** foto del estado económico de un mánager en un instante. serie temporal. */
export const managerSnapshot = sqliteTable(
	'manager_snapshot',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		managerId: text('manager_id')
			.notNull()
			.references(() => manager.id),
		ts: integer('ts').notNull(),
		cash: integer('cash').notNull(),
		teamValue: integer('team_value').notNull(),
		/** poder de puja = cash + 25% del valor de plantilla */
		maxBid: integer('max_bid').notNull(),
		/** gasto estimado en subidas de cláusula (cash, no créditos) */
		clauseSpend: integer('clause_spend').notNull().default(0),
		/** pujas comprometidas; solo se conoce para el mánager propio */
		pendingBids: integer('pending_bids').notNull().default(0),
		/** true si la fila viene del saldo real y no de la estimación */
		exact: integer('exact', { mode: 'boolean' }).notNull().default(false),
		points: integer('points'),
		position: integer('position'),
	},
	(t) => [index('manager_snapshot_manager_ts_idx').on(t.managerId, t.ts)],
);

// ===== jugadores =====

export const player = sqliteTable('player', {
	id: text('id').primaryKey(), // id de fantasy marca
	name: text('name').notNull(),
	position: integer('position').notNull(),
	teamId: integer('team_id'),
	photoUrl: text('photo_url'),
	createdAt: integer('created_at').notNull(),
});

/**
 * foto de un jugador en un instante: valor, cláusula, dueño y escudo.
 * es la base de los gráficos de evolución que v1 nunca tuvo.
 */
export const playerSnapshot = sqliteTable(
	'player_snapshot',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		playerId: text('player_id')
			.notNull()
			.references(() => player.id),
		communityId: text('community_id').notNull(),
		ts: integer('ts').notNull(),
		value: integer('value').notNull(),
		points: integer('points').notNull().default(0),
		average: real('average').notNull().default(0),
		/** null = agente libre */
		ownerId: text('owner_id'),
		clause: integer('clause'),
		/** cláusula / valor: la cantidad que el dueño controla realmente */
		clauseMultiplier: real('clause_multiplier'),
		/** 0 = sin escudo. ojo: el listado miente, solo el detalle es fiable */
		shield: integer('shield').notNull().default(0),
		listed: integer('listed', { mode: 'boolean' }).notNull().default(false),
		clausesRank: integer('clauses_rank'),
	},
	(t) => [
		index('player_snapshot_player_ts_idx').on(t.playerId, t.ts),
		index('player_snapshot_owner_idx').on(t.ownerId),
	],
);

/** cambios derivados del diff entre snapshots consecutivos */
export const clauseChange = sqliteTable(
	'clause_change',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		playerId: text('player_id')
			.notNull()
			.references(() => player.id),
		ts: integer('ts').notNull(),
		/** clause_up | clause_down | shield_on | shield_off | owner_change | acquired | released */
		kind: text('kind').notNull(),
		ownerId: text('owner_id'),
		prevOwnerId: text('prev_owner_id'),
		oldClause: integer('old_clause'),
		newClause: integer('new_clause'),
		/** valor en el momento del cambio: sin esto el coste no se puede estimar bien */
		value: integer('value'),
	},
	(t) => [index('clause_change_ts_idx').on(t.ts), index('clause_change_player_idx').on(t.playerId)],
);

// ===== movimientos de dinero =====

/**
 * traspasos observados. la clave de dedup es (feedId, playerId) para los eventos del
 * feed; los recuperados por reconciliación usan un feedId sintético.
 */
export const transfer = sqliteTable(
	'transfer',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		communityId: text('community_id').notNull(),
		/** id de la tarjeta del feed; sintético si viene de reconciliación */
		feedId: integer('feed_id').notNull(),
		playerId: text('player_id').notNull(),
		playerName: text('player_name').notNull(),
		/** null = el sistema (mercado) */
		fromManagerId: text('from_manager_id'),
		toManagerId: text('to_manager_id'),
		price: integer('price').notNull(),
		/** market | clause | loan */
		kind: text('kind').notNull().default('market'),
		/** feed | reconcile | balance: de dónde salió el registro */
		source: text('source').notNull(),
		occurredAt: integer('occurred_at'),
		seenAt: integer('seen_at').notNull(),
		/** true = anterior al baseline, ya reflejado en el cash inicial */
		baseline: integer('baseline', { mode: 'boolean' }).notNull().default(false),
	},
	(t) => [
		uniqueIndex('transfer_feed_player_uq').on(t.feedId, t.playerId),
		index('transfer_seen_idx').on(t.seenAt),
	],
);

/**
 * historial exacto de movimientos del mánager propio (/ajax/sw/balance).
 * es la única fuente de verdad para calibrar: incluye penalizaciones por subir
 * cláusula y bonificaciones que ningún otro endpoint expone.
 */
export const balanceMovement = sqliteTable(
	'balance_movement',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		communityId: text('community_id').notNull(),
		ts: integer('ts').notNull(),
		/** Compra | Venta | Compra por cláusula | Venta por cláusula | Penalización | Bonificación */
		type: text('type').notNull(),
		reason: text('reason').notNull(),
		amount: integer('amount').notNull(),
		/** saldo resultante tras el movimiento */
		balance: integer('balance').notNull(),
	},
	(t) => [uniqueIndex('balance_movement_ts_reason_uq').on(t.ts, t.reason, t.amount)],
);

// ===== calendario =====

export const gameweek = sqliteTable('gameweek', {
	id: integer('id').primaryKey(), // id de fantasy marca
	number: integer('number').notNull(),
	season: text('season').notNull(),
	status: text('status').notNull(),
	firstMatchAt: integer('first_match_at'),
	lastMatchAt: integer('last_match_at'),
});

// ===== estado de los pollers =====

/** watermark por poller: permite reanudar y aplicar backoff exponencial */
export const pollerState = sqliteTable('poller_state', {
	poller: text('poller').primaryKey(),
	lastRunAt: integer('last_run_at'),
	lastOkAt: integer('last_ok_at'),
	cursor: text('cursor'),
	failures: integer('failures').notNull().default(0),
	lastError: text('last_error'),
});

// ===== autenticación =====

/**
 * cuentas con acceso al dashboard. la app es de uso personal: el alta se controla
 * con ALLOWED_EMAILS, no hay registro abierto.
 */
export const appUser = sqliteTable('app_user', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().unique(),
	name: text('name'),
	createdAt: integer('created_at').notNull(),
	lastSeenAt: integer('last_seen_at'),
});

/** tabla de sesiones canónica de la plataforma */
export const authSession = defineSessionTable(() => appUser.id);

// ===== oauth 2.1 para mcp =====
// fantasy actúa como authorization server de los clientes mcp: dcr → authorize →
// token → refresh. separado de la sesión del dashboard (cookie) porque un cliente
// mcp no tiene navegador donde guardarla.

/** clientes dados de alta por dynamic client registration (rfc 7591) */
export const mcpOauthClient = sqliteTable('mcp_oauth_client', {
	clientId: text('client_id').primaryKey(),
	name: text('name'),
	redirectUrisJson: text('redirect_uris_json').notNull(),
	grantTypesJson: text('grant_types_json').notNull(),
	tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
	createdAt: integer('created_at').notNull(),
	lastUsedAt: integer('last_used_at'),
});

/** authorization codes de vida corta y un solo uso */
export const mcpOauthCode = sqliteTable(
	'mcp_oauth_code',
	{
		codeHash: text('code_hash').primaryKey(),
		userId: integer('user_id').notNull(),
		clientId: text('client_id').notNull(),
		redirectUri: text('redirect_uri').notNull(),
		codeChallenge: text('code_challenge').notNull(),
		codeChallengeMethod: text('code_challenge_method').notNull(),
		/** audiencia solicitada: se propaga al token para el binding */
		resource: text('resource'),
		scope: text('scope').notNull(),
		expiresAt: integer('expires_at').notNull(),
		consumedAt: integer('consumed_at'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('idx_mcp_code_expires').on(t.expiresAt)],
);

/** access tokens activos; se guardan hasheados, nunca en claro */
export const mcpOauthAccessToken = sqliteTable(
	'mcp_oauth_access_token',
	{
		tokenHash: text('token_hash').primaryKey(),
		userId: integer('user_id').notNull(),
		clientId: text('client_id').notNull(),
		scope: text('scope').notNull(),
		/** audiencia del recurso: un token para otro recurso no vale aquí */
		resource: text('resource').notNull(),
		expiresAt: integer('expires_at').notNull(),
		createdAt: integer('created_at').notNull(),
		lastUsedAt: integer('last_used_at'),
	},
	(t) => [index('idx_mcp_access_expires').on(t.expiresAt)],
);

/**
 * refresh tokens con rotación: cada canje marca el viejo con replacedByHash.
 * si reaparece uno ya rotado se revoca la cadena entera (detección de replay).
 */
export const mcpOauthRefreshToken = sqliteTable(
	'mcp_oauth_refresh_token',
	{
		tokenHash: text('token_hash').primaryKey(),
		userId: integer('user_id').notNull(),
		clientId: text('client_id').notNull(),
		scope: text('scope').notNull(),
		resource: text('resource').notNull(),
		expiresAt: integer('expires_at').notNull(),
		createdAt: integer('created_at').notNull(),
		replacedByHash: text('replaced_by_hash'),
		revokedAt: integer('revoked_at'),
	},
	(t) => [index('idx_mcp_refresh_expires').on(t.expiresAt)],
);
