// importa el histórico de v2 (~/dev/fantasy-zig) a la base de datos de v3.
//
// los traspasos que v2 capturó del feed son IRRECUPERABLES: esos eventos ya han
// hecho scroll en el sitio y no existe endpoint que los devuelva. este script es
// la única vía de conservarlos.
//
// uso: pnpm --filter @fantasy/api exec tsx src/scripts/backfill-v2.ts [ruta-v2]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAppEnv } from '@platform/core-api';
import { getDb, closeDb } from '../db/connection.js';
import { upsertManager, addAlias } from '../queries/managers.js';
import { insertTransfers, type TransferInsert } from '../queries/transfers.js';
import { upsertPlayers, insertPlayerSnapshots } from '../queries/players.js';
import { community } from '../db/schema.js';

interface V2Ledger {
	community?: string;
	start_budget?: number;
	initialized?: string;
	managers?: Record<string, number>;
	team_values?: Record<string, number>;
	aliases?: Record<string, string>;
	self_name?: string;
	transfers?: {
		feed_id: number;
		player_id: string;
		player: string;
		from: string;
		to: string;
		price: number;
		seen: string;
		baseline?: boolean;
	}[];
}

interface V2Clauses {
	updated?: string;
	players?: Record<
		string,
		{ name: string; owner: string; owner_id?: number; clause: number; value: number; shield?: number; listed?: boolean }
	>;
}

const v2Dir = process.argv[2] ?? '/home/mier/dev/fantasy-zig';
loadAppEnv(import.meta.url, { levelsUp: 3 });

const ledger = readJson<V2Ledger>(resolve(v2Dir, 'ledger.json'));
const clauses = readJson<V2Clauses>(resolve(v2Dir, 'clauses.json'));

if (!ledger?.community) {
	console.error('no se encontró ledger.json con comunidad en', v2Dir);
	process.exit(1);
}

const communityId = ledger.community;
const now = Date.now();
const db = getDb();

db.insert(community)
	.values({
		id: communityId,
		name: '',
		startBudget: ledger.start_budget ?? 200_000_000,
		isActive: true,
		resetAt: ledger.initialized ? Date.parse(ledger.initialized) : null,
		createdAt: now,
	})
	.onConflictDoUpdate({ target: community.id, set: { startBudget: ledger.start_budget ?? 200_000_000 } })
	.run();

// v2 indexaba a los mánagers por nombre, pero la identidad canónica en v3 es el
// id_uc numérico (el que trae la clasificación). clauses.json guarda ese id junto
// al nombre del dueño, así que sirve de tabla de equivalencias.
const nameToUc = new Map<string, string>();
for (const p of Object.values(clauses?.players ?? {})) {
	if (p.owner && p.owner_id) nameToUc.set(p.owner, String(p.owner_id));
}

// un mánager renombrado aparece en clauses.json con su nombre NUEVO, así que el
// canónico hereda el id_uc de su alias; sin esto acaba duplicado (una fila con id
// sintético del backfill y otra que crea el poller con el nombre actual).
for (const [alias, canonical] of Object.entries(ledger.aliases ?? {})) {
	const aliasUc = nameToUc.get(alias);
	if (aliasUc && !nameToUc.has(canonical)) nameToUc.set(canonical, aliasUc);
}

const nameToId = new Map<string, string>();
for (const [name, initialCash] of Object.entries(ledger.managers ?? {})) {
	// sin equivalencia conocida se cae a un id sintético; el poller lo reconciliará
	const id = nameToUc.get(name) ?? `name:${name}`;
	upsertManager({
		id,
		communityId,
		name,
		isSelf: name === ledger.self_name,
		initialCash,
	});
	nameToId.set(name, id);
}

// los alias también tienen que resolver al mapear los traspasos: v2 guardaba los
// nombres tal cual aparecían en el feed, que usa el nombre ACTUAL del equipo
const resolveName = new Map(nameToId);
for (const [alias, canonical] of Object.entries(ledger.aliases ?? {})) {
	const target = nameToId.get(canonical);
	if (!target) continue;
	addAlias(alias, target);
	resolveName.set(alias, target);
}

// traspasos: se conserva el feed_id original para que la dedup siga funcionando
// cuando el poller vuelva a ver los eventos que aún no han hecho scroll
const transferRows: TransferInsert[] = (ledger.transfers ?? []).map((t) => ({
	communityId,
	feedId: t.feed_id,
	playerId: t.player_id,
	playerName: t.player,
	fromManagerId: resolveName.get(t.from) ?? null,
	toManagerId: resolveName.get(t.to) ?? null,
	price: t.price,
	kind: t.from && t.to && resolveName.has(t.from) && resolveName.has(t.to) ? 'clause' : 'market',
	source: 'v2',
	seenAt: Date.parse(t.seen) || now,
	baseline: Boolean(t.baseline),
}));
const insertedTransfers = insertTransfers(transferRows);

// snapshot de cláusulas: una única foto con la marca de tiempo de v2, para que la
// serie temporal arranque con un punto histórico en vez de desde cero
let insertedSnapshots = 0;
if (clauses?.players) {
	const snapshotTs = clauses.updated ? Date.parse(clauses.updated) : now;
	const entries = Object.entries(clauses.players);

	upsertPlayers(
		entries.map(([id, p]) => ({ id, name: p.name, position: 0, teamId: null, photoUrl: null })),
	);

	insertPlayerSnapshots(
		entries.map(([id, p]) => ({
			playerId: id,
			communityId,
			ts: snapshotTs,
			value: p.value,
			points: 0,
			average: 0,
			ownerId: resolveName.get(p.owner) ?? null,
			clause: p.clause,
			clauseMultiplier: p.value > 0 ? p.clause / p.value : null,
			shield: p.shield ?? 0,
			listed: Boolean(p.listed),
			clausesRank: null,
		})),
	);
	insertedSnapshots = entries.length;
}

console.log(
	[
		`comunidad ${communityId}`,
		`${nameToId.size} mánagers`,
		`${insertedTransfers}/${transferRows.length} traspasos nuevos`,
		`${insertedSnapshots} snapshots de cláusula`,
	].join(' · '),
);

closeDb();

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		console.warn(`aviso: no se pudo leer ${path}`);
		return null;
	}
}
