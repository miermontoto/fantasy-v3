// metadatos de descubrimiento oauth. son los que permiten que un cliente mcp
// se registre y se autorice solo, sin configuración manual:
// - rfc 9728: metadatos del recurso protegido (a qué authorization server ir)
// - rfc 8414: metadatos del authorization server (dónde están sus endpoints)

import { Hono } from 'hono';
import { MCP_OAUTH } from '../constants.js';
import { publicBaseUrl, resourceUrl } from './oauth-mcp.js';

const wellKnown = new Hono();

wellKnown.get('/oauth-protected-resource', (c) =>
	c.json({
		resource: resourceUrl(),
		authorization_servers: [publicBaseUrl()],
		scopes_supported: [MCP_OAUTH.SCOPE],
		bearer_methods_supported: ['header'],
	}),
);

// algunos clientes piden la variante con el path del recurso colgando
wellKnown.get('/oauth-protected-resource/mcp', (c) =>
	c.json({
		resource: resourceUrl(),
		authorization_servers: [publicBaseUrl()],
		scopes_supported: [MCP_OAUTH.SCOPE],
		bearer_methods_supported: ['header'],
	}),
);

wellKnown.get('/oauth-authorization-server', (c) => {
	const base = publicBaseUrl();
	return c.json({
		issuer: base,
		authorization_endpoint: `${base}/api/oauth/mcp/authorize`,
		token_endpoint: `${base}/api/oauth/mcp/token`,
		registration_endpoint: `${base}/api/oauth/mcp/register`,
		scopes_supported: [MCP_OAUTH.SCOPE],
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		// oauth 2.1: clientes públicos con pkce, sin secreto
		token_endpoint_auth_methods_supported: ['none'],
		code_challenge_methods_supported: ['S256'],
	});
});

export default wellKnown;
