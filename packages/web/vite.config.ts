// config de vite delegada al preset compartido de @platform/config.
import { createWebConfig, createPwaOptions } from '@platform/config/vite';

export default createWebConfig({
	proxy: ['/api'],
	pwa: createPwaOptions({
		name: 'fantasy',
		shortName: 'fantasy',
		description: 'inteligencia de mercado para fantasy marca',
		themeColor: '#0a0c0e',
	}),
});
