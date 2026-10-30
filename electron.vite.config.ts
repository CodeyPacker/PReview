import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// Entries follow electron-vite's defaults: src/main, src/preload, src/renderer/index.html.
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [
      // Generates src/renderer/routeTree.gen.ts from the files in src/renderer/routes.
      // Must run before the React plugin.
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve(import.meta.dirname, 'src/renderer/routes'),
        generatedRouteTree: resolve(import.meta.dirname, 'src/renderer/routeTree.gen.ts'),
        quoteStyle: 'single',
      }),
      react(),
    ],
  },
});
