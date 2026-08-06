// sesión del dashboard: usuario actual y logout. el gate real es el 401 de la
// api (redirige a /login desde el transporte); esto solo da identidad a la ui.

import { api, type SessionUser } from '$lib/api';

let user = $state<SessionUser | null>(null);

export function sessionUser(): SessionUser | null {
	return user;
}

export async function loadSession(): Promise<void> {
	if (user) return;
	try {
		user = (await api.me()).user;
	} catch {
		// el 401 ya redirige desde on401; cualquier otro fallo deja la ui anónima
		user = null;
	}
}

export async function logout(): Promise<void> {
	try {
		await api.logout();
	} finally {
		user = null;
	}
}
