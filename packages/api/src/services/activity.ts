// feed unificado de la liga: traspasos y cambios de cláusula en una sola línea
// temporal, con el mánager y la tarjeta del jugador ya resueltos.
//
// la separación en dos listas era un accidente de cómo se recogen los datos (dos
// pollers distintos), no algo que signifique nada para quien mira: un clausulazo
// y la subida de cláusula que lo provocó son la misma historia. aquí se mezclan
// por fecha y cada evento sale con lo necesario para pintarse entero, sin que la
// ui tenga que resolver ids contra otra petición.

import { listManagers } from '../queries/managers.js';
import { playerCards, recentClauseChanges, type RosterEntry } from '../queries/players.js';
import { listTransfers } from '../queries/transfers.js';

/** un mánager implicado en el evento. null en el evento = fue el mercado. */
export interface ActivityActor {
	id: string;
	name: string;
	isSelf: boolean;
}

export interface ActivityEvent {
	/** clave estable para el each de la ui */
	id: string;
	ts: number;
	/** transfer | clause: de qué poller sale, por si la ui quiere filtrar */
	group: 'transfer' | 'clause';
	/** market | clause | loan | clause_up | clause_down | shield_on | shield_off | owner_change | acquired | released */
	kind: string;
	/** quién suelta al jugador; null = venía del mercado */
	from: ActivityActor | null;
	/** quién se lo queda; null = se fue al mercado */
	to: ActivityActor | null;
	/** importe pagado. solo en traspasos */
	price: number | null;
	oldClause: number | null;
	newClause: number | null;
	playerId: string;
	playerName: string;
	/** tarjeta del jugador; null si todavía no hay ningún snapshot suyo */
	player: RosterEntry | null;
}

export interface ActivityOptions {
	communityId: string;
	limit?: number;
	/** restringe el feed a un jugador: alimenta su ficha */
	playerId?: string;
}

const DEFAULT_LIMIT = 60;

/** el único `kind` en el que ownerId es el dueño saliente y no el entrante */
const RELEASED = 'released';

/**
 * los traspasos anteriores al baseline ya están reflejados en el cash inicial y
 * no son «actividad»: son el punto de partida. se piden de más para que el
 * recorte no deje el feed corto tras filtrarlos.
 */
const BASELINE_MARGIN = 2;

export function recentActivity(options: ActivityOptions): ActivityEvent[] {
	const limit = options.limit ?? DEFAULT_LIMIT;
	const actors = new Map(
		listManagers(options.communityId).map((m) => [m.id, { id: m.id, name: m.name, isSelf: m.isSelf }]),
	);
	const actor = (id: string | null): ActivityActor | null => (id ? (actors.get(id) ?? null) : null);

	const transfers: ActivityEvent[] = listTransfers(
		options.communityId,
		limit * BASELINE_MARGIN,
		options.playerId,
	)
		.filter((row) => !row.baseline)
		.map((row) => ({
			id: `t:${row.id}`,
			// occurredAt es cuándo pasó; seenAt solo cuándo lo vimos nosotros
			ts: row.occurredAt ?? row.seenAt,
			group: 'transfer' as const,
			kind: row.kind,
			from: actor(row.fromManagerId),
			to: actor(row.toManagerId),
			price: row.price,
			oldClause: null,
			newClause: null,
			playerId: row.playerId,
			playerName: row.playerName,
			player: null,
		}));

	const changes: ActivityEvent[] = recentClauseChanges(limit, options.playerId).map((row) => ({
		// clause_change no tiene clave natural estable entre pasadas: la compone
		// el trío que la hace única
		id: `c:${row.playerId}:${row.ts}:${row.kind}`,
		ts: row.ts,
		group: 'clause' as const,
		kind: row.kind,
		// en un `released` el diff guarda en ownerId al dueño que lo PIERDE, no al
		// que lo gana: sin invertirlo aquí la tarjeta pinta «mercado → Lendoiro» y
		// una baja se lee como un fichaje
		from: row.kind === RELEASED ? actor(row.ownerId) : actor(row.prevOwnerId),
		to: row.kind === RELEASED ? null : actor(row.ownerId),
		price: null,
		oldClause: row.oldClause,
		newClause: row.newClause,
		playerId: row.playerId,
		playerName: row.playerId,
		player: null,
	}));

	// se recorta ANTES de buscar las tarjetas: cargar snapshots de eventos que se
	// van a descartar es el gasto que hace lento un feed
	const events = [...transfers, ...changes].sort((a, b) => b.ts - a.ts).slice(0, limit);
	const cards = playerCards(events.map((event) => event.playerId));

	return events.map((event) => {
		const player = cards.get(event.playerId) ?? null;
		return { ...event, player, playerName: player?.name ?? event.playerName };
	});
}
