// poller de clasificación y saldo: refresca el valor de plantilla de cada mánager
// (la mitad del cálculo del poder de puja) y calibra la fila propia con el saldo real.

import type { Poller } from '../poller-runner.js';
import { MAX_DEBT_VALUE_PCT, POLL_INTERVAL } from '../../constants.js';
import { parseStandings } from '../../scraper/html.js';
import { parseQuickBalance, parseBalanceHistory } from '../../scraper/json.js';
import { getCommunityId, getSelfManagerId, isConfigured, withSession } from '../session.js';
import { insertManagerSnapshot, listManagers, upsertManager } from '../../queries/managers.js';
import { insertBalanceMovements } from '../../queries/balance.js';
import { estimateCash } from '../ledger.js';

export const standingsPoller: Poller = {
	name: 'standings',
	intervalMs: POLL_INTERVAL.STANDINGS,
	enabled: isConfigured,

	async runOnce() {
		const communityId = await getCommunityId();
		const now = Date.now();

		const html = await withSession((browser) => browser.standings());
		const entries = parseStandings(html);
		if (entries.length === 0) throw new Error('clasificación vacía: ¿cambió el markup?');

		// el saldo propio es exacto; el de los rivales hay que estimarlo
		const quick = parseQuickBalance(await withSession((browser) => browser.balance()));
		const movements = parseBalanceHistory(await withSession((browser) => browser.balanceHistory()));
		insertBalanceMovements(communityId, movements);

		const selfId = await getSelfManagerId();

		for (const entry of entries) {
			const managerId = entry.managerId;
			const isSelf = managerId === selfId;
			upsertManager({ id: managerId, communityId, name: entry.name, isSelf });

			const estimate = estimateCash(communityId, managerId);
			const cash = isSelf && quick ? quick.current : estimate.cash;
			const pendingBids = isSelf && quick ? quick.current - quick.future : 0;
			// techo de puja = saldo + deuda permitida, nunca por debajo de cero: un
			// mánager muy endeudado simplemente no puede comprar, no tiene capacidad
			// "negativa". la capacidad REALMENTE disponible del mánager propio (que
			// además descuenta las pujas comprometidas) va aparte, en remainingNow.
			const maxBid = Math.max(0, cash + Math.round(MAX_DEBT_VALUE_PCT * entry.teamValue));
			const remainingNow = isSelf && quick ? quick.remainingDebt : null;

			insertManagerSnapshot({
				managerId,
				ts: now,
				cash,
				teamValue: entry.teamValue,
				maxBid,
				clauseSpend: estimate.clauseSpend,
				pendingBids,
				remainingNow,
				exact: isSelf && quick !== null,
				points: entry.points,
				position: entry.position,
			});
		}

		console.log(`[poller:standings] ${entries.length} mánagers, ${listManagers(communityId).length} en total`);
	},
};
