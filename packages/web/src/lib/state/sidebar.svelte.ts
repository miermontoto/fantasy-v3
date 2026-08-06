// estado de colapso de la sidebar, persistido por dispositivo en localStorage.
// runa a nivel de módulo con getter, el patrón de estado de sis/duckhunt.

const STORAGE_KEY = 'fantasy:sidebar-collapsed';

let collapsed = $state(typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1');

export function isCollapsed(): boolean {
	return collapsed;
}

export function toggleSidebar(): void {
	collapsed = !collapsed;
	localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
}
