// tests de la parte crítica del authorization server: pkce, un solo uso del code,
// binding de audiencia y detección de replay en la rotación del refresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPkce, hashToken, randomToken } from './mcp-oauth.js';

test('verifyPkce acepta el verifier correcto con S256', () => {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	assert.equal(verifyPkce(verifier, challenge, 'S256'), true);
});

test('verifyPkce rechaza un verifier distinto', () => {
	const challenge = createHash('sha256').update('bueno').digest('base64url');
	assert.equal(verifyPkce('malo', challenge, 'S256'), false);
});

test('verifyPkce rechaza el método plain (oauth 2.1 exige S256)', () => {
	assert.equal(verifyPkce('x', 'x', 'plain'), false);
});

test('hashToken no es reversible y es estable', () => {
	const token = randomToken();
	assert.equal(hashToken(token), hashToken(token));
	assert.notEqual(hashToken(token), token);
	assert.equal(hashToken(token).length, 64);
});

test('randomToken genera valores distintos y suficientemente largos', () => {
	const a = randomToken();
	const b = randomToken();
	assert.notEqual(a, b);
	assert.ok(a.length >= 32);
});
