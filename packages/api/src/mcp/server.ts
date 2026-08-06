// servidor mcp: tools delgadas sobre queries/* y services/*.
// comparte TOOLS y dispatch con los transports stdio (mcp/stdio.ts) y http (mcp/http.ts).
//
// regla: una tool mcp y una ruta http son hermanas delgadas sobre la misma query.
// si hay lógica que escribir, va en services/, no aquí.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { VERSION } from '../constants.js';
import { getCommunityId, getSelfManagerId } from '../services/session.js';
import { latestSnapshots, snapshotHistory } from '../queries/managers.js';
import { listTransfers } from '../queries/transfers.js';
import { getPlayer, playerHistory } from '../queries/players.js';
import { recentChanges, stealTargets } from '../services/clauses.js';
import { runNow } from '../services/poller-runner.js';

export const TOOLS: Tool[] = [
	{
		name: 'fantasy_ledger',
		description:
			'Contabilidad de la liga: cash estimado, valor de plantilla y poder de puja (cash + 25% del valor) de cada mánager, ordenado por poder de puja descendente. La fila propia viene calibrada del saldo real; las de los rivales son estimaciones con unos millones de incertidumbre.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'fantasy_steal_targets',
		description:
			'Jugadores con dueño ordenados por ratio cláusula/valor ascendente: los objetivos de robo más baratos primero. Pagar la cláusula fuerza el traspaso salvo que haya escudo activo.',
		inputSchema: {
			type: 'object',
			properties: {
				owner: { type: 'string', description: 'filtra por id de mánager' },
				budget: { type: 'number', description: 'marca affordable los que caben en este presupuesto' },
				hideShielded: { type: 'boolean', description: 'excluye a los protegidos por escudo' },
				excludeOwn: { type: 'boolean', description: 'deja fuera a los jugadores propios' },
				limit: { type: 'number', description: 'máximo de resultados (por defecto 25)' },
			},
		},
	},
	{
		name: 'fantasy_clause_changes',
		description:
			'Últimos cambios de cláusula, escudo y propiedad. Una subida de cláusula señala que el dueño considera clave a ese jugador; un shield_off abre una ventana de robo.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'number', description: 'máximo de cambios (por defecto 50)' } },
		},
	},
	{
		name: 'fantasy_transfers',
		description: 'Registro de traspasos observados con precios exactos: quién compró a quién y por cuánto.',
		inputSchema: {
			type: 'object',
			properties: { limit: { type: 'number', description: 'máximo de traspasos (por defecto 50)' } },
		},
	},
	{
		name: 'fantasy_player',
		description:
			'Ficha de un jugador con su serie temporal de valor y cláusula, para ver si se está revalorizando y cómo ha evolucionado su protección.',
		inputSchema: {
			type: 'object',
			properties: {
				playerId: { type: 'string', description: 'id del jugador en fantasy marca' },
				days: { type: 'number', description: 'ventana de histórico en días (por defecto 30)' },
			},
			required: ['playerId'],
		},
	},
	{
		name: 'fantasy_manager_history',
		description: 'Serie temporal del cash y el poder de puja de un mánager: cómo ha evolucionado su capacidad de compra.',
		inputSchema: {
			type: 'object',
			properties: {
				managerId: { type: 'string' },
				days: { type: 'number', description: 'ventana en días (por defecto 30)' },
			},
			required: ['managerId'],
		},
	},
	{
		name: 'fantasy_sync',
		description:
			'Fuerza una pasada de un poller (feed, clauses o standings) y espera a que termine. Útil antes de analizar si el mercado acaba de rotar.',
		inputSchema: {
			type: 'object',
			properties: { poller: { type: 'string', enum: ['feed', 'clauses', 'standings'] } },
			required: ['poller'],
		},
	},
];

const schemas = {
	stealTargets: z.object({
		owner: z.string().optional(),
		budget: z.number().optional(),
		hideShielded: z.boolean().optional(),
		excludeOwn: z.boolean().optional(),
		limit: z.number().optional(),
	}),
	limitOnly: z.object({ limit: z.number().optional() }),
	player: z.object({ playerId: z.string(), days: z.number().optional() }),
	managerHistory: z.object({ managerId: z.string(), days: z.number().optional() }),
	sync: z.object({ poller: z.enum(['feed', 'clauses', 'standings']) }),
};

function sinceFromDays(days: number | undefined, fallback = 30): number {
	return Date.now() - (days ?? fallback) * 24 * 60 * 60 * 1000;
}

/** ejecuta una tool y devuelve el payload ya serializable */
export async function dispatch(name: string, rawArgs: unknown): Promise<unknown> {
	switch (name) {
		case 'fantasy_ledger': {
			const communityId = await getCommunityId();
			return {
				managers: latestSnapshots(communityId)
					.map(({ manager, snapshot }) => ({
						managerId: manager.id,
						name: manager.name,
						isSelf: manager.isSelf,
						cash: snapshot.cash,
						teamValue: snapshot.teamValue,
						maxBid: snapshot.maxBid,
						clauseSpend: snapshot.clauseSpend,
						exact: snapshot.exact,
					}))
					.sort((a, b) => b.maxBid - a.maxBid),
			};
		}

		case 'fantasy_steal_targets': {
			const args = schemas.stealTargets.parse(rawArgs ?? {});
			const communityId = await getCommunityId();
			return {
				targets: stealTargets({
					communityId,
					ownerId: args.owner,
					budget: args.budget,
					hideShielded: args.hideShielded,
					selfId: await getSelfManagerId(),
					excludeOwn: args.excludeOwn,
					limit: args.limit ?? 25,
				}),
			};
		}

		case 'fantasy_clause_changes': {
			const args = schemas.limitOnly.parse(rawArgs ?? {});
			return { changes: recentChanges(args.limit ?? 50) };
		}

		case 'fantasy_transfers': {
			const args = schemas.limitOnly.parse(rawArgs ?? {});
			const communityId = await getCommunityId();
			return { transfers: listTransfers(communityId, args.limit ?? 50) };
		}

		case 'fantasy_player': {
			const args = schemas.player.parse(rawArgs);
			const info = getPlayer(args.playerId);
			if (!info) return { error: 'jugador desconocido' };
			return { player: info, history: playerHistory(args.playerId, sinceFromDays(args.days)) };
		}

		case 'fantasy_manager_history': {
			const args = schemas.managerHistory.parse(rawArgs);
			return { history: snapshotHistory(args.managerId, sinceFromDays(args.days)) };
		}

		case 'fantasy_sync': {
			const args = schemas.sync.parse(rawArgs);
			await runNow(args.poller);
			return { ok: true, poller: args.poller };
		}

		default:
			throw new Error(`tool desconocida: ${name}`);
	}
}

export function createMcpServer(): Server {
	const server = new Server(
		{ name: 'fantasy', version: VERSION },
		{ capabilities: { tools: {} } },
	);

	server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const result = await dispatch(request.params.name, request.params.arguments);
		return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
	});

	return server;
}
