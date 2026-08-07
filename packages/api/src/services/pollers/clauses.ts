// poller de cláusulas: barre el listado completo de jugadores y guarda un snapshot
// de CADA uno (con dueño o libre), además de los cambios respecto a la pasada
// anterior. los agentes libres no generan eventos pero sí snapshot: son la otra
// mitad del mercado y sin ellos el visor solo enseña plantillas ajenas.
//
// el filtro server-side `filters[owner]` devuelve vacío para cualquier valor no cero
// (verificado en 26/27), así que hay que barrer todas las páginas y filtrar aquí.

import type { Poller } from '../poller-runner.js';
import { CLAUSE, POLL_INTERVAL } from '../../constants.js';
import { parsePlayersList, type PlayerListItem } from '../../scraper/json.js';
import { getCommunityId, isConfigured, withSession } from '../session.js';
import {
	insertClauseChanges,
	insertPlayerSnapshots,
	latestOwnedSnapshots,
	upsertPlayers,
	type ClauseChangeInsert,
	type PlayerSnapshotInsert,
} from '../../queries/players.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 30;
/** tolerancia de redondeo al comparar multiplicadores */
const MULTIPLIER_EPSILON = 0.02;

export const clausesPoller: Poller = {
	name: 'clauses',
	intervalMs: POLL_INTERVAL.CLAUSES,
	enabled: isConfigured,

	async runOnce() {
		const communityId = await getCommunityId();
		const now = Date.now();

		const all: PlayerListItem[] = [];
		for (let page = 0; page < MAX_PAGES; page += 1) {
			const data = await withSession((browser) => browser.playersPage(page * PAGE_SIZE));
			const players = parsePlayersList(data);
			all.push(...players);
			if (players.length < PAGE_SIZE) break;
		}

		upsertPlayers(
			all.map((p) => ({
				id: p.id,
				name: p.name,
				position: p.position,
				teamId: p.teamId,
				photoUrl: p.photoUrl,
			})),
		);

		const owned = all.filter((p) => p.ownerId !== null);
		// el diff de cláusulas solo mira a los que tienen dueño: un agente libre no
		// tiene cláusula que subir ni dueño del que cambiar
		const previous = new Map(latestOwnedSnapshots(communityId).map((row) => [row.playerId, row]));

		// se guarda la liga ENTERA, no solo lo que tiene dueño: sin los agentes
		// libres el visor no puede enseñar lo que se puede fichar del mercado, que
		// es la otra mitad de las oportunidades
		const snapshots: PlayerSnapshotInsert[] = all.map((p) => ({
			playerId: p.id,
			communityId,
			ts: now,
			value: p.value,
			points: p.points,
			average: p.average,
			ownerId: p.ownerId,
			clause: p.clause,
			clauseMultiplier: p.clauseMultiplier,
			shield: p.shield,
			listed: p.listed,
			clausesRank: p.clausesRank,
			prevValue: p.previousValue,
			status: p.status,
			streakJson: JSON.stringify(p.streak),
		}));

		const changes: ClauseChangeInsert[] = [];
		for (const p of owned) {
			const before = previous.get(p.id);
			if (!before) {
				changes.push({
					playerId: p.id,
					ts: now,
					kind: 'acquired',
					ownerId: p.ownerId,
					newClause: p.clause,
					value: p.value,
				});
				continue;
			}

			// el suelo conocido se guarda EN el evento, no solo se usa para detectarlo:
			// es el divisor del multiplicador y la base sobre la que el juego cobra el
			// escalón, así que sin él el ledger no puede poner precio al cambio.
			const floor = before.clauseFloor;

			if (before.ownerId !== p.ownerId) {
				changes.push({
					playerId: p.id,
					ts: now,
					kind: 'owner_change',
					ownerId: p.ownerId,
					prevOwnerId: before.ownerId,
					oldClause: before.clause,
					newClause: p.clause,
					value: p.value,
					clauseFloor: floor,
				});
			}

			// una subida de cláusula solo es real si cambia el multiplicador sobre el
			// SUELO. como el listado no da el suelo, se compara la cláusula contra el
			// suelo conocido de la pasada profunda; sin él no se emite evento, porque
			// `cláusula / valor` se mueve cada día por el mercado y generaba cientos
			// de subidas falsas.
			const wasFloor = before.clause === CLAUSE.FLOOR && p.clause === CLAUSE.FLOOR;
			const oldMultiplier = floor ? (before.clause ?? 0) / floor : 0;
			const newMultiplier = floor ? (p.clause ?? 0) / floor : 0;
			if (floor && !wasFloor && Math.abs(newMultiplier - oldMultiplier) > MULTIPLIER_EPSILON) {
				changes.push({
					playerId: p.id,
					ts: now,
					kind: newMultiplier > oldMultiplier ? 'clause_up' : 'clause_down',
					ownerId: p.ownerId,
					oldClause: before.clause,
					newClause: p.clause,
					value: p.value,
					clauseFloor: floor,
				});
			}

			if ((before.shield === 0) !== (p.shield === 0)) {
				changes.push({
					playerId: p.id,
					ts: now,
					kind: p.shield !== 0 ? 'shield_on' : 'shield_off',
					ownerId: p.ownerId,
					oldClause: before.clause,
					newClause: p.clause,
					value: p.value,
					clauseFloor: floor,
				});
			}
		}

		// jugadores que tenían dueño y ya no aparecen
		const ownedIds = new Set(owned.map((p) => p.id));
		for (const [playerId, before] of previous) {
			if (ownedIds.has(playerId)) continue;
			changes.push({
				playerId,
				ts: now,
				kind: 'released',
				ownerId: before.ownerId,
				oldClause: before.clause,
				value: before.value,
			});
		}

		insertPlayerSnapshots(snapshots);
		// la primera pasada no genera eventos: no hay con qué comparar
		if (previous.size > 0) insertClauseChanges(changes);

		console.log(
			`[poller:clauses] ${all.length} jugadores (${owned.length} con dueño, ${all.length - owned.length} libres), ${previous.size > 0 ? changes.length : 0} cambios`,
		);
	},
};
