import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '200.html' }),
		// polling de versión: tras un deploy, navegación full-page en vez de importar
		// chunks hasheados que ya no existen
		version: { pollInterval: 60_000 },
	},
};

export default config;
