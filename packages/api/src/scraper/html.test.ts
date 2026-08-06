// tests de los parsers html. los fixtures son fragmentos del html real de 26/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	parseFeedTransfers,
	parseSessionInfo,
	parseBalanceInfo,
	parseBalanceValue,
	parseEuropeanNumber,
} from './html.js';

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
	const html = `<script>_FG_cfg = {"pag":"feed","auth":"0dfdad67605187e4a5e87170a877ed48",` +
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

test('parseFeedTransfers lee varios jugadores de una tarjeta', () => {
	const html = `
<div id="feed-28067055" class="card card-transfer" data-comments="0">
<ul class="player-list"><li><div class="item"><div class="title">
<strong>Iker Luque</strong> cambia de <em> Kirkrael Menéndez </em> a <em> Fantasy MARCA </em>
</div><div class="player-row"><a class="btn player" href="players/70255/iker-luque">
</a><div class="price">506.660</div></div></div></li>
<li><div class="item"><div class="title">
<strong>Robin Le Normand</strong> cambia de <em> Kirkrael Menéndez </em> a <em> Fantasy MARCA </em>
</div><div class="player-row"><a class="btn player" href="players/12345/robin-le-normand">
</a><div class="price">6.862.000</div></div></div></li></ul></div>`;

	const events = parseFeedTransfers(html);
	assert.equal(events.length, 2);
	assert.equal(events[0].feedId, 28067055);
	assert.equal(events[0].playerId, '70255');
	assert.equal(events[0].playerName, 'Iker Luque');
	assert.equal(events[0].from, 'Kirkrael Menéndez');
	// el sistema se normaliza a null
	assert.equal(events[0].to, null);
	assert.equal(events[0].price, 506660);
	assert.equal(events[1].price, 6862000);
});

test('parseFeedTransfers ignora tarjetas que no son de traspaso', () => {
	const html = `<div id="feed-100" class="card card-news"><div class="title">
<strong>Pedri</strong> cambia de <em>MC</em> a <em>DL</em></div></div>`;
	assert.equal(parseFeedTransfers(html).length, 0);
});

test('parseFeedTransfers ignora items sin precio', () => {
	const html = `<div id="feed-200" class="card card-transfer"><div class="title">
<strong>Sin Precio</strong> cambia de <em> A </em> a <em> B </em></div></div>`;
	assert.equal(parseFeedTransfers(html).length, 0);
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
