// conexión sqlite de fantasy sobre la factoría compartida de @platform/db.
import { createSqliteDb, type SqliteDbHandle } from '@platform/db';
import * as schema from './schema.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let handle: SqliteDbHandle<typeof schema> | null = null;

export function getDb() {
	if (handle) return handle.db;
	handle = createSqliteDb({
		schema,
		defaultPath: './data/fantasy.db',
		// migraciones en dev (src/db/migrations) y prod (dist/db/migrations)
		migrationsCandidates: [resolve(__dirname, 'migrations'), resolve(__dirname, 'db/migrations')],
	});
	return handle.db;
}

export function closeDb() {
	handle?.close();
	handle = null;
}

export type Db = ReturnType<typeof getDb>;
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];
