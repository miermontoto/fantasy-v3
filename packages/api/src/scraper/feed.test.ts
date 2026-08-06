// tests del parser del feed json. los fixtures son recortes de respuestas reales
// de POST /ajax/feed en 26/27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedPage } from './feed.js';

const transferCard = (extra: Record<string, unknown> = {}) => ({
	id: 28135538,
	category: 'transfer',
	created: '2026-08-04 23:16:32',
	data: [
		{
			id_transfer: 82599825,
			id_uc_from: 1345784,
			id_uc_to: 0,
			type: 'normal',
			price: 325710,
			from: 'Adrian',
			to: 'Fantasy MARCA',
			id: 52404,
			name: 'Manu Bueno',
			...extra,
		},
	],
});

test('parseFeedPage saca ids numéricos de mánager y trata el 0 como el sistema', () => {
	const page = parseFeedPage(JSON.stringify({ status: 'ok', data: [transferCard()] }));

	assert.equal(page.transfers.length, 1);
	const [t] = page.transfers;
	assert.equal(t.fromManagerId, '1345784');
	// id_uc 0 es "Fantasy MARCA": el mercado, no un mánager
	assert.equal(t.toManagerId, null);
	assert.equal(t.playerId, '52404');
	assert.equal(t.price, 325710);
	assert.equal(t.kind, 'market');
});

test('parseFeedPage distingue el clausulazo del traspaso normal', () => {
	const page = parseFeedPage(
		JSON.stringify({
			status: 'ok',
			data: [transferCard({ type: 'clause', id_uc_to: 1345378 })],
		}),
	);
	assert.equal(page.transfers[0].kind, 'clause');
	assert.equal(page.transfers[0].toManagerId, '1345378');
});

test('parseFeedPage ignora player_transfer: son traspasos reales de laliga', () => {
	const card = {
		id: 27124484,
		category: 'player_transfer',
		created: '2026-07-06 08:58:41',
		data: [
			{
				id: 18184,
				name: 'Jokin Ezkieta',
				from: 'Racing de Santander',
				to: 'void',
				value: 2576000,
			},
		],
	};
	assert.equal(parseFeedPage(JSON.stringify({ status: 'ok', data: [card] })).transfers.length, 0);
});

test('parseFeedPage recoge los renombres de equipo', () => {
	const card = {
		id: 28027413,
		category: 'change_name',
		created: '2026-07-31 18:14:06',
		data: { new_name: 'Alejandrismo sociológico', previous_name: 'Big Yahu' },
	};
	const page = parseFeedPage(JSON.stringify({ status: 'ok', data: [card] }));
	assert.deepEqual(
		page.renames.map((r) => [r.previousName, r.newName]),
		[['Big Yahu', 'Alejandrismo sociológico']],
	);
});

test('parseFeedPage tolera las tarjetas separadoras sin id', () => {
	const page = parseFeedPage(JSON.stringify({ status: 'ok', data: [{ category: 'date', date: 'hoy' }] }));
	assert.equal(page.transfers.length, 0);
	assert.equal(page.ended, false);
});

test('parseFeedPage marca el final de la historia', () => {
	const page = parseFeedPage(JSON.stringify({ status: 'end' }));
	assert.equal(page.ended, true);
	assert.equal(page.transfers.length, 0);
});

test('parseFeedPage falla si la respuesta no es json (x-auth caducado)', () => {
	assert.throws(() => parseFeedPage('<html>login</html>'), /no es json/);
});
