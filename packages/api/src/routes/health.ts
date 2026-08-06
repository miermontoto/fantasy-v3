// health check: lo consume el HEALTHCHECK del contenedor.
import { Hono } from 'hono';
import { VERSION } from '../constants.js';

const health = new Hono();

health.get('/', (c) => c.json({ status: 'ok', version: VERSION }));

export default health;
