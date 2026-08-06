// formateo compartido. el dinero del juego siempre se lee en millones.

export function money(value: number): string {
	const millions = value / 1_000_000;
	const digits = Math.abs(millions) >= 100 ? 1 : 2;
	return `${millions.toFixed(digits)}M`;
}

export function signedMoney(value: number): string {
	return `${value > 0 ? '+' : ''}${money(value)}`;
}

const THOUSAND = 1_000;
const MILLION = 1_000_000;

/**
 * delta de valor. los cambios diarios de mercado son de decenas de miles y en
 * millones se leen todos como «0.00M», así que por debajo del millón se muestran
 * en miles. es la única excepción a leer el dinero en millones, y existe justo
 * para que un cambio pequeño no parezca ausencia de cambio.
 */
export function signedDelta(value: number): string {
	const sign = value > 0 ? '+' : value < 0 ? '-' : '';
	const abs = Math.abs(value);
	if (abs < MILLION) return `${sign}${Math.round(abs / THOUSAND)}k`;
	return `${sign}${(abs / MILLION).toFixed(2)}M`;
}

/** clase css según el signo, para no repetir ternarios en las plantillas */
export function trendClass(value: number): string {
	if (value > 0) return 'up';
	if (value < 0) return 'down';
	return '';
}

const POSITION_LABEL: Record<number, string> = { 1: 'PT', 2: 'DF', 3: 'MC', 4: 'DL' };

export function position(code: number): string {
	return POSITION_LABEL[code] ?? '—';
}

export function relativeTime(ts: number): string {
	const minutes = Math.round((Date.now() - ts) / 60_000);
	if (minutes < 1) return 'ahora';
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	return `hace ${Math.round(hours / 24)} d`;
}
