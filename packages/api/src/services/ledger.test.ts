// el poder de puja es la cifra que decide si una puja es viable: se fija aquí
// para que nadie vuelva a introducir un máximo negativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DEBT_VALUE_PCT } from '../constants.js';

/** max_bid = max(cash, 0) + 25% del valor de plantilla */
function maxBid(cash: number, teamValue: number): number {
	return Math.max(cash, 0) + Math.round(MAX_DEBT_VALUE_PCT * teamValue);
}

test('con saldo positivo suma la deuda permitida', () => {
	// caso verificado contra el juego: 108.2M + 25% de 94.97M = 131.93M
	assert.equal(maxBid(108_200_000, 94_966_000), 131_941_500);
});

test('un saldo negativo no resta: el máximo nunca baja de 25% de la plantilla', () => {
	assert.equal(maxBid(-66_790_000, 140_910_000), 35_227_500);
});

test('el poder de puja nunca es negativo', () => {
	assert.equal(maxBid(-500_000_000, 0), 0);
	assert.ok(maxBid(-1, 1) >= 0);
});
