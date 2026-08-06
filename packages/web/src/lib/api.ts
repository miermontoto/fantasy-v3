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

export interface StealTarget {
	playerId: string;
	name: string;
	position: number;
	ownerName: string;
	value: number;
	clause: number;
	ratio: number;
	atFloor: boolean;
	shielded: boolean;
	listed: boolean;
	affordable: boolean;
	isOwn: boolean;
}

export interface ClauseChange {
	playerId: string;
	name: string;
	kind: string;
	ownerName: string | null;
	prevOwnerName: string | null;
	oldClause: number | null;
	newClause: number | null;
	ts: number;
}

export interface TransferRow {
	id: number;
	playerId: string;
	playerName: string;
	fromManagerId: string | null;
	toManagerId: string | null;
	price: number;
	kind: string;
	seenAt: number;
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
	transfers: (limit = 60) => http.get<{ transfers: TransferRow[] }>(`/ledger/transfers?limit=${limit}`),
	clauses: (params: { budget?: number; excludeOwn?: boolean; hideShielded?: boolean; limit?: number } = {}) => {
		const q = new URLSearchParams();
		if (params.budget !== undefined) q.set('budget', String(params.budget));
		if (params.excludeOwn) q.set('excludeOwn', 'true');
		if (params.hideShielded) q.set('hideShielded', 'true');
		q.set('limit', String(params.limit ?? 60));
		return http.get<{ targets: StealTarget[] }>(`/clauses?${q}`);
	},
	clauseChanges: (limit = 40) => http.get<{ changes: ClauseChange[] }>(`/clauses/changes?limit=${limit}`),
	player: (id: string, days = 30) =>
		http.get<{ player: PlayerInfo; history: PlayerPoint[] }>(`/players/${id}?days=${days}`),
	managers: () => http.get<{ managers: ManagerInfo[] }>('/managers'),
	roster: (id: string) => http.get<{ players: RosterPlayer[] }>(`/managers/${id}/roster`),
	pollers: () => http.get<{ pollers: PollerRow[] }>('/sync'),
	runPoller: (name: string) => http.post<{ ok: boolean; error?: string }>(`/sync/${name}`),
};
