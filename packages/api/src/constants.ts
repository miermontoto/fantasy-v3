// constantes canónicas de la api. sin números ni strings mágicos repartidos por el código.

export const VERSION = '26w32a';

// origen scrapeado
export const FANTASY_BASE_URL = 'https://fantasy.marca.com';

// cloudflare rechaza user-agents cortos o genéricos: hay que mandar la ua completa
export const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';

// textos que el juego usa como marcadores en el html
export const FREE_AGENT = 'Libre';
export const SYSTEM_MANAGER = 'Fantasy MARCA';

// economía de cláusulas (verificado temporada 26/27)
export const CLAUSE = {
	/** multiplicador por defecto tras un reset o una compra */
	BASE_MULTIPLIER: 1.5,
	/** cada escalón sube el multiplicador en +0.5 */
	STEP_SIZE: 0.5,
	/** tope observado */
	MAX_MULTIPLIER: 4,
	/** el primer escalón cuesta el 20% del valor; los siguientes escalan x2, x3... */
	STEP_RATE: 0.2,
	/** bajar la cláusula reembolsa la mitad de lo invertido */
	REFUND_PCT: 0.5,
	/** suelo mínimo de cláusula: infla el ratio de los jugadores baratos */
	FLOOR: 1_000_000,
} as const;

// deuda permitida = este porcentaje del valor de plantilla.
// techo de puja = max(0, cash + deuda permitida): nunca es negativo, porque no
// existe la capacidad de compra negativa; con deuda suficiente es simplemente 0.
export const MAX_DEBT_VALUE_PCT = 0.25;

// intervalos de los pollers
export const POLL_INTERVAL = {
	/** el feed hace scroll y pierde eventos: es el poller más crítico */
	FEED: 15 * 60 * 1000,
	MARKET: 60 * 60 * 1000,
	/** barrido completo del listado de jugadores (~11 peticiones) */
	CLAUSES: 6 * 60 * 60 * 1000,
	BALANCE: 60 * 60 * 1000,
	STANDINGS: 6 * 60 * 60 * 1000,
} as const;

export const POSITION = {
	GK: 1,
	DEF: 2,
	MID: 3,
	FWD: 4,
} as const;

export type Position = (typeof POSITION)[keyof typeof POSITION];

// sesión del dashboard
export const SESSION_COOKIE_NAME = 'fantasy_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;


// oauth 2.1 del mcp
export const MCP_OAUTH = {
	/** los codes viven lo justo para el round-trip del cliente */
	CODE_TTL_MS: 60 * 1000,
	ACCESS_TTL_MS: 60 * 60 * 1000,
	REFRESH_TTL_MS: 30 * 24 * 60 * 60 * 1000,
	SCOPE: 'fantasy:read',
} as const;
