import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
  },
});
