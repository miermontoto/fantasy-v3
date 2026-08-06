// transport stdio del mcp: es el que consume claude code en local.
// abre la misma base que la api (wal permite acceso concurrente).

import { loadAppEnv } from '@platform/core-api';

loadAppEnv(import.meta.url);

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDb } from '../db/connection.js';
import { createMcpServer } from './server.js';

getDb();

const server = createMcpServer();
const transport = new StdioServerTransport();

server.connect(transport).then(
	// stdout es el canal del protocolo: los logs van por stderr
	() => console.error('[mcp:stdio] conectado'),
	(err) => {
		console.error('[mcp:stdio] error:', err);
		process.exit(1);
	},
);
