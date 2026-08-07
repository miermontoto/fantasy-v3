// tests de los parsers json. los fixtures reproducen la forma real de los endpoints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parsePlayersList,
	parsePlayerCommunityInfo,
	parseBalanceHistory,
	parseQuickBalance,
	clauseSteps,
	clauseLadderCost,
} from './json.js';

test('parsePlayersList usa uc_name/id_uc y clausesRank (no owner.name)', () => {
	const data = {
		players: [
			{
				id: 59484,
				name: 'Marc Bernal',
				position: 3,
				id_team: 3,
				value: 21828000,
				prev_value: 21528000,
				points: 0,
				avg: 0,
				id_uc: 1345964,
				uc_name: 'Lendoiro',
				clause: 76398000,
				shield: 0,
				id_market: null,
				clausesRank: 35,
			},
		],
	};

	const [player] = parsePlayersList(data);
	assert.equal(player.id, '59484');
	assert.equal(player.ownerName, 'Lendoiro');
	assert.equal(player.ownerId, '1345964');
	assert.equal(player.clausesRank, 35);
	assert.equal(player.listed, false);
	// 76.398M / 21.828M ≈ 3.5x
	assert.ok(Math.abs((player.clauseMultiplier ?? 0) - 3.5) < 0.01);
});

test('parsePlayersList marca como libre al jugador sin dueño', () => {
	const [player] = parsePlayersList({
		players: [{ id: 1, name: 'Libre', position: 4, value: 1000, id_uc: null, uc_name: null, id_market: 55 }],
	});
	assert.equal(player.ownerId, null);
	assert.equal(player.ownerName, null);
	assert.equal(player.listed, true);
});

test('parsePlayerCommunityInfo normaliza owner.id 0 a agente libre', () => {
	const info = parsePlayerCommunityInfo({
		id: 58954,
		name: 'Kylian Mbappé',
		value: 82048000,
		owner: { id: 0, name: '' },
		market: { id: null },
		bid: { amount: null },
		clause: { value: 123072000, percentage: 50, shield: 0, tier: 5 },
	});
	assert.ok(info);
	assert.equal(info.ownerId, null);
	assert.equal(info.clausePercentage, 50);
	assert.equal(info.shield, '');
});

test('parsePlayerCommunityInfo conserva el escudo descriptivo del detalle', () => {
	const info = parsePlayerCommunityInfo({
		id: 36410,
		name: 'Aubameyang',
		value: 5386000,
		owner: { id: 1345380, name: 'Mister Excel' },
		clause: { value: 21544000, percentage: 300, shield: '1 hora 26 minutos', tier: 2 },
	});
	assert.ok(info);
	assert.equal(info.ownerId, '1345380');
	assert.equal(info.clausePercentage, 300);
	assert.equal(info.shield, '1 hora 26 minutos');
});

test('parseBalanceHistory limpia los tags del motivo', () => {
	const movements = parseBalanceHistory({
		history: [
			{
				ts: 1785959849,
				adate: '05/08/2026 – 21:57',
				reason: 'Bright Ede <span>a</span> Sergio Mourinheiro',
				type: 'Compra por cláusula',
				amount: -1279500,
				balance: -51070603,
			},
		],
	});
	assert.equal(movements.length, 1);
	assert.equal(movements[0].reason, 'Bright Ede a Sergio Mourinheiro');
	assert.equal(movements[0].amount, -1279500);
});

test('parseQuickBalance mapea maxDebt a capacidad restante', () => {
	const balance = parseQuickBalance({ current: -51070603, future: -52403936, maxDebt: 9226564 });
	assert.ok(balance);
	assert.equal(balance.current, -51070603);
	assert.equal(balance.remainingDebt, 9226564);
});

test('clauseSteps cuenta escalones sobre el multiplicador base', () => {
	assert.equal(clauseSteps(150, 100), 0); // 1.5x = por defecto
	assert.equal(clauseSteps(200, 100), 1); // 2.0x = un escalón
	assert.equal(clauseSteps(400, 100), 5); // 4.0x = tope
});

test('clauseLadderCost: un escalón cuesta el 20% del suelo', () => {
	// verificado en real: grimaldo 28.674M de 50% → 100% costó 5.7348M
	assert.equal(clauseLadderCost(28_674_000, 0, 1), 5_734_800);
	// y en el historial de balance: «Penalización | Modificación de cláusula (100%)
	// de Fran García» = 2.9928M sobre un suelo de 14.964M (lo que se pagó por él)
	assert.equal(clauseLadderCost(14_964_000, 0, 1), 2_992_800);
});

test('clauseLadderCost es LINEAL, no triangular', () => {
	// todos los escalones cuestan lo mismo: el segundo no vale el doble
	assert.equal(clauseLadderCost(1_000_000, 1, 2), 200_000);
	// llegar al tope (1.5 → 4.0, cinco escalones) cuesta el suelo entero, no el triple
	assert.equal(clauseLadderCost(1_000_000, 0, 5), 1_000_000);
	// bajar de 2 a 1 devuelve el 50% de ese escalón
	assert.equal(clauseLadderCost(1_000_000, 2, 1), -100_000);
});
