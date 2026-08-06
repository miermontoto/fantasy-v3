// runner de pollers: programa, aplica backoff exponencial y persiste el watermark.
//
// regla dura (heredada de duckhunt): un poller NUNCA captura sus propios errores.
// si los traga, el runner no puede aplicar backoff y un fallo permanente se convierte
// en un bucle silencioso de peticiones. deja que lancen; el runner registra y espacia.

import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { pollerState } from '../db/schema.js';

export interface Poller {
	/** identificador estable; es la clave del watermark en poller_state */
	name: string;
	intervalMs: number;
	/**
	 * ejecuta una pasada. recibe el cursor persistido de la anterior y devuelve
	 * el nuevo (o undefined para dejarlo igual). debe dejar escapar sus errores.
	 */
	runOnce(cursor?: string): Promise<string | void>;
	/** permite desactivar un poller sin desregistrarlo (p.ej. falta el token) */
	enabled?(): boolean;
}

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

const registry = new Map<string, Poller>();
const timers = new Map<string, NodeJS.Timeout>();

export function registerPoller(poller: Poller): void {
	if (registry.has(poller.name)) {
		throw new Error(`poller duplicado: ${poller.name}`);
	}
	registry.set(poller.name, poller);
}

/** espera tras n fallos consecutivos: 1m, 2m, 4m... hasta 1h */
function backoffMs(failures: number): number {
	if (failures <= 0) return 0;
	return Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
}

function readState(name: string) {
	const db = getDb();
	const [row] = db.select().from(pollerState).where(eq(pollerState.poller, name)).limit(1).all();
	return row;
}

function writeState(name: string, patch: Partial<typeof pollerState.$inferInsert>): void {
	const db = getDb();
	db.insert(pollerState)
		.values({ poller: name, failures: 0, ...patch })
		.onConflictDoUpdate({ target: pollerState.poller, set: patch })
		.run();
}

async function runAndReschedule(poller: Poller): Promise<void> {
	const now = Date.now();
	const state = readState(poller.name);

	if (poller.enabled && !poller.enabled()) {
		schedule(poller, poller.intervalMs);
		return;
	}

	try {
		const cursor = await poller.runOnce(state?.cursor ?? undefined);
		writeState(poller.name, {
			lastRunAt: now,
			lastOkAt: Date.now(),
			failures: 0,
			lastError: null,
			...(typeof cursor === 'string' ? { cursor } : {}),
		});
		schedule(poller, poller.intervalMs);
	} catch (err) {
		const failures = (state?.failures ?? 0) + 1;
		const message = err instanceof Error ? err.message : String(err);
		writeState(poller.name, { lastRunAt: now, failures, lastError: message });
		console.error(`[poller:${poller.name}] fallo ${failures}: ${message}`);
		schedule(poller, Math.max(poller.intervalMs, backoffMs(failures)));
	}
}

function schedule(poller: Poller, delayMs: number): void {
	const timer = setTimeout(() => {
		void runAndReschedule(poller);
	}, delayMs);
	// no mantener vivo el proceso solo por un poller pendiente
	timer.unref?.();
	timers.set(poller.name, timer);
}

/** arranca todos los pollers registrados; la primera pasada respeta el watermark */
export function startAll(): void {
	const now = Date.now();
	for (const poller of registry.values()) {
		const state = readState(poller.name);
		const elapsed = state?.lastRunAt ? now - state.lastRunAt : Infinity;
		const pending = Math.max(0, poller.intervalMs - elapsed);
		const penalty = backoffMs(state?.failures ?? 0);
		schedule(poller, Math.max(pending, penalty));
	}
}

export function stopAll(): void {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
}

/** fuerza una pasada inmediata (lo usan las rutas de sync manual) */
export async function runNow(name: string): Promise<void> {
	const poller = registry.get(name);
	if (!poller) throw new Error(`poller desconocido: ${name}`);
	const timer = timers.get(name);
	if (timer) clearTimeout(timer);
	await runAndReschedule(poller);
}

export function listPollers(): { name: string; intervalMs: number }[] {
	return [...registry.values()].map((p) => ({ name: p.name, intervalMs: p.intervalMs }));
}
