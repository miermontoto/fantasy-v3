// composición de la api de fantasy sobre el hono base de @platform/core-api:
// rutas de dominio y, al final, la spa estática.
import { createPlatformApp, mountSpa } from '@platform/core-api';
import health from './routes/health.js';
import ledger from './routes/ledger.js';
import clauses from './routes/clauses.js';
import players from './routes/players.js';
import sync from './routes/sync.js';
import mcpHttp from './mcp/http.js';

const app = createPlatformApp();

app.route('/api/health', health);
app.route('/api/ledger', ledger);
app.route('/api/clauses', clauses);
app.route('/api/players', players);
app.route('/api/sync', sync);
app.route('/mcp', mcpHttp);

// la spa se monta siempre al final: hace fallback de cualquier ruta no-/api a 200.html
mountSpa(app);

export default app;
