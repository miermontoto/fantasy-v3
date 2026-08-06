// composición de la api de fantasy sobre el hono base de @platform/core-api:
// rutas de dominio y, al final, la spa estática.
import { createPlatformApp, mountSpa } from '@platform/core-api';
import health from './routes/health.js';

const app = createPlatformApp();

app.route('/api/health', health);

// la spa se monta siempre al final: hace fallback de cualquier ruta no-/api a 200.html
mountSpa(app);

export default app;
