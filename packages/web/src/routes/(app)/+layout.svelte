<script lang="ts">
	// shell autenticado: sidebar fija estilo sis (colapsable a raíl de iconos)
	// que en móvil se convierte en cabecera + tabbar inferior.
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { isCollapsed, toggleSidebar } from '$lib/state/sidebar.svelte';
	import { sessionUser, loadSession, logout } from '$lib/state/session.svelte';

	let { children } = $props();
	let version = $state<string | null>(null);

	// iconos de navegación: markup svg estático (trazo feather 24×24); un
	// registro de glifos aparte no compensa para cuatro entradas.
	const NAV = [
		{ href: '/', label: 'liga', icon: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
		{ href: '/clauses', label: 'cláusulas', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
		{
			href: '/managers',
			label: 'plantillas',
			icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
		},
		{ href: '/activity', label: 'actividad', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
	] as const;

	$effect(() => {
		loadSession();
		api.health()
			.then((h) => (version = h.version))
			.catch(() => (version = null));
	});

	// la raíz solo casa exacta; el resto por prefijo, así /players/x y
	// /managers/x mantienen viva su sección
	const isActive = (href: string): boolean =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	async function onLogout() {
		await logout();
		goto('/login');
	}
</script>

{#snippet navIcon(icon: string)}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{@html icon}
	</svg>
{/snippet}

<div class="app-layout" class:sidebar-collapsed={isCollapsed()}>
	<aside class="sidebar">
		<a class="brand" href="/" title="fantasy">
			<span class="brand-mark">f</span><span class="brand-rest">antasy</span>
		</a>

		<nav class="side-nav">
			{#each NAV as item (item.href)}
				<a href={item.href} class:active={isActive(item.href)} title={item.label}>
					{@render navIcon(item.icon)}
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="spacer"></div>

		{#if sessionUser()}
			<div class="user" title={sessionUser()?.email}>
				<span class="user-name">{sessionUser()?.name ?? sessionUser()?.email}</span>
				<button class="logout" onclick={onLogout} title="cerrar sesión">salir</button>
			</div>
		{/if}

		<button class="collapse" onclick={toggleSidebar} title={isCollapsed() ? 'expandir' : 'colapsar'}>
			{isCollapsed() ? '»' : '«'}
		</button>

		{#if version}
			<span class="version">{version}</span>
		{/if}
	</aside>

	<header class="mobile-header">
		<span class="brand-mobile">fantasy</span>
		{#if sessionUser()}
			<button class="logout" onclick={onLogout} title="cerrar sesión">salir</button>
		{/if}
	</header>

	<main class="main-content">
		{@render children()}
	</main>

	<nav class="mobile-tabbar">
		{#each NAV as item (item.href)}
			<a href={item.href} class:active={isActive(item.href)}>
				{@render navIcon(item.icon)}
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	/* el esqueleto (.app-layout/.sidebar/.main-content/.mobile-*) vive en
	   app.css; aquí solo el interior del chrome */
	.brand {
		display: flex;
		font-weight: 700;
		font-size: 1rem;
		color: var(--accent);
		letter-spacing: 0.03em;
		padding: 0 var(--sp-2);
		overflow: hidden;
		white-space: nowrap;
	}
	.brand:hover {
		color: var(--accent);
	}
	.side-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: var(--sp-4);
	}
	.side-nav a {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
	}
	.side-nav a:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
	.side-nav a.active {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}
	.side-nav svg {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}
	.spacer {
		flex: 1;
	}
	.user {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0 var(--sp-2);
		font-size: 0.75rem;
		overflow: hidden;
	}
	.user-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
	}
	.logout {
		font-size: 0.7rem;
		padding: 2px var(--sp-2);
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.collapse {
		align-self: flex-start;
		font-size: 0.8rem;
		padding: 2px var(--sp-2);
		color: var(--text-muted);
		border: none;
	}
	.version {
		padding: 0 var(--sp-2);
		font-size: 0.65rem;
		color: var(--text-faint);
	}

	/* colapsado: solo la marca "f" y los iconos */
	:global(.app-layout.sidebar-collapsed) .brand-rest,
	:global(.app-layout.sidebar-collapsed) .nav-label,
	:global(.app-layout.sidebar-collapsed) .user,
	:global(.app-layout.sidebar-collapsed) .version {
		display: none;
	}

	.brand-mobile {
		font-weight: 700;
		color: var(--accent);
	}
	.mobile-header .logout {
		margin-left: auto;
	}
	.mobile-tabbar svg {
		width: 18px;
		height: 18px;
	}
</style>
