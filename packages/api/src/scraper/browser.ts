// cliente http contra fantasy.marca.com.
//
// usa curl como subproceso en vez de fetch: cloudflare rechaza clientes con
// user-agents genéricos o firmas tls raras, y curl con la ua completa de chrome
// pasa sin problemas. es la misma decisión que en v2 y está verificada.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FANTASY_BASE_URL, USER_AGENT } from '../constants.js';

const execFileAsync = promisify(execFile);

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_SECONDS = 30;

export interface BrowserAuth {
	/** cookie refresh-token: jwt de larga duración */
	refreshToken: string;
	/** x-auth de la comunidad activa; rota y muere al cambiar de temporada */
	xauth?: string;
}

export class ScrapeError extends Error {
	constructor(
		message: string,
		readonly path: string,
	) {
		super(`${message} (${path})`);
		this.name = 'ScrapeError';
	}
}

export class Browser {
	constructor(private readonly auth: BrowserAuth) {}

	async get(path: string): Promise<string> {
		return this.request('GET', path);
	}

	async post(path: string, payload = ''): Promise<string> {
		return this.request('POST', path, payload);
	}

	private async request(method: 'GET' | 'POST', path: string, payload?: string): Promise<string> {
		const args = [
			'-s',
			'--compressed',
			'--max-time',
			String(TIMEOUT_SECONDS),
			'-X',
			method,
			'-H',
			`User-Agent: ${USER_AGENT}`,
			'-H',
			'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
			'-H',
			'X-Requested-With: XMLHttpRequest',
			'-H',
			'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'-H',
			'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
			'-H',
			`Cookie: refresh-token=${this.auth.refreshToken}`,
		];

		if (this.auth.xauth) {
			args.push('-H', `X-Auth: ${this.auth.xauth}`);
		}
		if (method === 'POST') {
			args.push('--data', payload ?? '');
		}
		args.push(`${FANTASY_BASE_URL}${path}`);

		const { stdout } = await execFileAsync('curl', args, {
			maxBuffer: MAX_RESPONSE_BYTES,
			encoding: 'utf8',
		});

		if (!stdout) throw new ScrapeError('respuesta vacía', path);
		// cloudflare devuelve una página html de bloqueo con status 200
		if (stdout.includes('Attention Required! | Cloudflare')) {
			throw new ScrapeError('bloqueado por cloudflare', path);
		}
		return stdout;
	}

	/** parsea una respuesta ajax `{status, data}` y devuelve `data` */
	async postJson<T = unknown>(path: string, payload = ''): Promise<T> {
		const raw = await this.post(path, payload);
		let parsed: { status?: string; data?: T };
		try {
			parsed = JSON.parse(raw) as { status?: string; data?: T };
		} catch {
			// 401 devuelve json corto; html implica sesión caída o bloqueo
			throw new ScrapeError('respuesta no es json (¿x-auth caducado?)', path);
		}
		if (parsed.status !== 'ok') {
			throw new ScrapeError(`ajax status=${parsed.status ?? 'desconocido'} (¿x-auth caducado?)`, path);
		}
		if (parsed.data === undefined) throw new ScrapeError('ajax sin data', path);
		return parsed.data;
	}

	// ===== páginas html =====

	feed(): Promise<string> {
		return this.get('/feed');
	}

	market(): Promise<string> {
		return this.get('/market');
	}

	team(userId?: string): Promise<string> {
		return this.get(userId ? `/team/${userId}` : '/team');
	}

	standings(): Promise<string> {
		return this.get('/standings');
	}

	// ===== endpoints ajax =====
	// la web los registra como sws['clave'] = {post:'nombre'} → /ajax/sw/{clave}

	playersPage(offset: number, order = 4): Promise<unknown> {
		const payload = new URLSearchParams({
			post: 'players',
			'filters[position]': '0',
			'filters[owner]': '0',
			offset: String(offset),
			order: String(order),
			name: '',
		}).toString();
		return this.postJson('/ajax/sw/players', payload);
	}

	playerDetails(playerId: string): Promise<unknown> {
		return this.postJson('/ajax/sw/players', `post=players&id=${encodeURIComponent(playerId)}`);
	}

	/** contexto de un jugador en la comunidad: dueño, cláusula, mercado, puja propia */
	playerCommunityInfo(playerId: string): Promise<unknown> {
		return this.postJson('/ajax/player-community-info', `id_player=${encodeURIComponent(playerId)}`);
	}

	/** saldo propio rápido: {current, future, maxDebt} */
	balance(): Promise<unknown> {
		return this.postJson('/ajax/balance');
	}

	/** historial completo de movimientos del mánager propio */
	balanceHistory(): Promise<unknown> {
		return this.postJson('/ajax/sw/balance', 'post=balance');
	}

	gameweeks(): Promise<unknown> {
		return this.postJson('/ajax/sw/gameweek', 'post=gameweek');
	}

	communities(): Promise<unknown> {
		return this.postJson('/ajax/community-check');
	}

	offersReceived(): Promise<unknown> {
		return this.postJson('/ajax/sw/offers-received', 'post=offers-received');
	}
}
