// disparo manual de los pollers y estado del scheduler.
import { Hono } from 'hono';
import { listPollers, runNow } from '../services/poller-runner.js';
import { getDb } from '../db/connection.js';
import { pollerState } from '../db/schema.js';

const sync = new Hono();

sync.get('/', (c) => {
	const state = new Map(getDb().select().from(pollerState).all().map((row) => [row.poller, row]));
	const pollers = listPollers().map((p) => ({
		...p,
		lastRunAt: state.get(p.name)?.lastRunAt ?? null,
		lastOkAt: state.get(p.name)?.lastOkAt ?? null,
		failures: state.get(p.name)?.failures ?? 0,
		lastError: state.get(p.name)?.lastError ?? null,
	}));
	return c.json({ pollers });
});

sync.post('/:poller', async (c) => {
	const name = c.req.param('poller');
	try {
		await runNow(name);
		return c.json({ ok: true, poller: name });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ ok: false, poller: name, error: message }, 400);
	}
});

export default sync;
