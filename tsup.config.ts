import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  target: 'node18',
  bundle: true,
  platform: 'node',
  noExternal: ['commander', 'prompts'],
  define: {
    __BGL_VERSION__: JSON.stringify(pkg.version),
  },
  esbuildOptions(options) {
    options.alias = {
      '@': new URL('./src', import.meta.url).pathname,
    };
  },
  onSuccess: async () => {
    copyFileSync('src/server/local-server-entry.js', 'dist/local-server-entry.js');
  },
});
