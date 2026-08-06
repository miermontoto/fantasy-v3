// cliente http de la api. tipos alineados con las rutas de packages/api/src/routes.
// transporte compartido de la plataforma: OfflineError deja de disfrazarse de
// sesión caducada y el 401 redirige a /login (salvo que ya estemos allí).

import { createHttp } from '@platform/ui/http';

const LOGIN_PATH = '/login';

const http = createHttp({
	base: `${import.meta.env.VITE_API_BASE ?? ''}/api`,
	on401: () => {
		if (typeof window !== 'undefined' && window.location.pathname !== LOGIN_PATH) {
			window.location.href = LOGIN_PATH;
		}
	},
});

export interface SessionUser {
	id: number;
	email: string;
	name: string | null;
}

export interface ManagerRow {
	managerId: string;
	name: string;
	isSelf: boolean;
	cash: number;
	teamValue: number;
	maxBid: number;
	clauseSpend: number;
	pendingBids: number;
	/** capacidad disponible ahora (solo la publica el juego para uno mismo) */
	remainingNow: number | null;
	exact: boolean;
	points: number | null;
	position: number | null;
	ts: number;
}

/** un mánager implicado en un evento del feed */
export interface ActivityActor {
	id: string;
	name: string;
	isSelf: boolean;
}

export interface ActivityEvent {
	id: string;
	ts: number;
	group: 'transfer' | 'clause';
	kind: string;
	/** null = el mercado, no un mánager */
	from: ActivityActor | null;
	to: ActivityActor | null;
	price: number | null;
	oldClause: number | null;
	newClause: number | null;
	playerId: string;
	playerName: string;
	/** tarjeta del jugador; null si aún no hay snapshot suyo */
	player: RosterPlayer | null;
}

export interface PlayerInfo {
	id: string;
	name: string;
	position: number;
	photoUrl: string | null;
}

export interface PlayerPoint {
	ts: number;
	value: number;
	clause: number | null;
	clauseMultiplier: number | null;
	ownerId: string | null;
	shield: number;
}

export interface RosterPlayer {
	playerId: string;
	name: string;
	position: number;
	photoUrl: string | null;
	value: number;
	prevValue: number | null;
	points: number;
	average: number;
	clause: number | null;
	clauseMultiplier: number | null;
	shield: number;
	listed: boolean;
	clausesRank: number | null;
	status: string | null;
	streak: (number | null)[];
	/** null = agente libre */
	ownerId: string | null;
}

export interface ManagerInfo {
	id: string;
	name: string;
	isSelf: boolean;
}

export interface PollerRow {
	name: string;
	intervalMs: number;
	lastRunAt: number | null;
	lastOkAt: number | null;
	failures: number;
	lastError: string | null;
}

export const api = {
	health: () => http.get<{ status: string; version: string }>('/health'),
	me: () => http.get<{ authenticated: boolean; user: SessionUser }>('/auth/me'),
	logout: () => http.post<{ ok: boolean }>('/auth/logout'),
	ledger: () => http.get<{ communityId: string; managers: ManagerRow[] }>('/ledger'),
	managerHistory: (id: string, days = 30) =>
		http.get<{ history: { ts: number; cash: number; teamValue: number; maxBid: number }[] }>(
			`/ledger/history/${id}?days=${days}`,
		),
	/** feed unificado; sin `player` es toda la liga, con él la ficha de uno */
	activity: (limit = 60, playerId?: string) => {
		const q = new URLSearchParams({ limit: String(limit) });
		if (playerId) q.set('player', playerId);
		return http.get<{ events: ActivityEvent[] }>(`/activity?${q}`);
	},
	player: (id: string, days = 30) =>
		http.get<{ player: PlayerInfo; history: PlayerPoint[] }>(`/players/${id}?days=${days}`),
	managers: () => http.get<{ managers: ManagerInfo[] }>('/managers'),
	/** sin id devuelve la plantilla de la liga entera */
	roster: (id?: string | null) =>
		http.get<{ players: RosterPlayer[] }>(id ? `/managers/${id}/roster` : '/managers/roster'),
	pollers: () => http.get<{ pollers: PollerRow[] }>('/sync'),
	runPoller: (name: string) => http.post<{ ok: boolean; error?: string }>(`/sync/${name}`),
};
