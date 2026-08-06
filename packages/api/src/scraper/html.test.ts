// tests de los parsers html. los fixtures son fragmentos del html real de 26/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionInfo, parseBalanceInfo, parseBalanceValue, parseEuropeanNumber } from './html.js';

test('parseEuropeanNumber maneja separadores y negativos', () => {
	assert.equal(parseEuropeanNumber('1.234.567'), 1234567);
	assert.equal(parseEuropeanNumber('506.660'), 506660);
	assert.equal(parseEuropeanNumber('-23.741.500'), -23741500);
	assert.equal(parseEuropeanNumber('sin dígitos'), 0);
});

test('parseBalanceValue entiende el formato abreviado y el negativo', () => {
	assert.equal(parseBalanceValue('125,5M'), 125500000);
	assert.equal(parseBalanceValue('108.188.500'), 108188500);
	assert.equal(parseBalanceValue('-23.741.500'), -23741500);
});

test('parseSessionInfo extrae auth, comunidad y temporada de _FG_cfg', () => {
	const html =
		`<script>_FG_cfg = {"pag":"feed","auth":"0dfdad67605187e4a5e87170a877ed48",` +
		`"context":{"season":{"active":false,"id":175,"name":"26\\/27"}},"user":{"id_community":266343}};</script>`;

	const session = parseSessionInfo(html);
	assert.ok(session);
	assert.equal(session.auth, '0dfdad67605187e4a5e87170a877ed48');
	assert.equal(session.communityId, '266343');
	assert.equal(session.season, '26/27');
});

test('parseSessionInfo devuelve null si no hay _FG_cfg', () => {
	assert.equal(parseSessionInfo('<html><body>nada</body></html>'), null);
});

test('parseBalanceInfo tolera clases extra y saldos negativos', () => {
	const html = `<div class="live-balance">
<div class="value balance-real-current "> 108.188.500 </div>
<div class="value balance-real-future red"> -23.741.500 </div>
<div class="value balance-real-maxdebt "> 0 </div></div>`;

	const balance = parseBalanceInfo(html);
	assert.equal(balance.current, 108188500);
	assert.equal(balance.future, -23741500);
	assert.equal(balance.remainingDebt, 0);
});
