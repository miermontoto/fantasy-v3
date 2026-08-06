import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/mcp/stdio.ts'],
	format: ['esm'],
	dts: false,
	clean: true,
	// los paquetes @platform/* y @fantasy/shared se publican como fuente ts → bundlearlos
	noExternal: ['@fantasy/shared', /^@platform\//],
});
