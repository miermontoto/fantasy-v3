// entrypoint de la api: carga env, inicializa la db (ejecuta migraciones),
// arranca los pollers y levanta el servidor http con shutdown graceful.
import { loadAppEnv, startApiServer } from '@platform/core-api';
import { initTelemetry } from '@platform/observability';
import app from './app.js';
import { closeDb, getDb } from './db/connection.js';
import { registerPoller, startAll, stopAll } from './services/poller-runner.js';
import { feedPoller } from './services/pollers/feed.js';
import { clausesPoller } from './services/pollers/clauses.js';
import { clauseDetailPoller } from './services/pollers/clause-detail.js';
import { standingsPoller } from './services/pollers/standings.js';
import { VERSION } from './constants.js';

// .env desde raíz de la app (dev en monorepo) o cwd (docker); .env.local sobrescribe
loadAppEnv(import.meta.url);
// trazas + logs (export otlp solo si hay OTEL_EXPORTER_OTLP_ENDPOINT)
initTelemetry({ service: 'fantasy', version: VERSION });

getDb();

registerPoller(feedPoller);
registerPoller(clausesPoller);
registerPoller(clauseDetailPoller);
registerPoller(standingsPoller);

// DISABLE_POLLING=1 permite trabajar en local contra un snapshot de producción
if (process.env.DISABLE_POLLING !== '1') {
	startAll();
}

startApiServer(app, {
	name: 'fantasy',
	version: VERSION,
	onShutdown: () => {
		stopAll();
	},
	afterClose: closeDb,
});
