// cliente http de la api. tipos alineados con las rutas de packages/api/src/routes.

const base = import.meta.env.VITE_API_BASE ?? '';

/** un 401 significa sesión caducada: al login, no un error en pantalla */
function redirectToLogin(): never {
	if (typeof window !== 'undefined') window.location.href = '/login';
	throw new Error('sesión no válida');
}

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${base}/api${path}`, { credentials: 'include' });
	if (res.status === 401) redirectToLogin();
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return (await res.json()) as T;
}

async function post<T>(path: string): Promise<T> {
	const res = await fetch(`${base}/api${path}`, { method: 'POST', credentials: 'include' });
	if (res.status === 401) redirectToLogin();
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return (await res.json()) as T;
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
	playerName: string;
	fromManagerId: string | null;
	toManagerId: string | null;
	price: number;
	kind: string;
	seenAt: number;
}

export interface PlayerPoint {
	ts: number;
	value: number;
	clause: number | null;
	clauseMultiplier: number | null;
	shield: number;
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
	ledger: () => get<{ communityId: string; managers: ManagerRow[] }>('/ledger'),
	managerHistory: (id: string, days = 30) =>
		get<{ history: { ts: number; cash: number; teamValue: number; maxBid: number }[] }>(
			`/ledger/history/${id}?days=${days}`,
		),
	transfers: (limit = 60) => get<{ transfers: TransferRow[] }>(`/ledger/transfers?limit=${limit}`),
	clauses: (params: { budget?: number; excludeOwn?: boolean; hideShielded?: boolean; limit?: number } = {}) => {
		const q = new URLSearchParams();
		if (params.budget !== undefined) q.set('budget', String(params.budget));
		if (params.excludeOwn) q.set('excludeOwn', 'true');
		if (params.hideShielded) q.set('hideShielded', 'true');
		q.set('limit', String(params.limit ?? 60));
		return get<{ targets: StealTarget[] }>(`/clauses?${q}`);
	},
	clauseChanges: (limit = 40) => get<{ changes: ClauseChange[] }>(`/clauses/changes?limit=${limit}`),
	player: (id: string, days = 30) =>
		get<{ player: { id: string; name: string; position: number }; history: PlayerPoint[] }>(
			`/players/${id}?days=${days}`,
		),
	pollers: () => get<{ pollers: PollerRow[] }>('/sync'),
	runPoller: (name: string) => post<{ ok: boolean; error?: string }>(`/sync/${name}`),
};
