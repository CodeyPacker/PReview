import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Main-process and shared code, plus renderer tests that render to a string, run in Node.
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/shared/**/*.test.ts',
            'src/renderer/**/*.test.{ts,tsx}',
          ],
        },
      },
      {
        // Every Storybook story renders in Chromium and must pass the a11y checks.
        plugins: [storybookTest({ configDir: join(import.meta.dirname, '.storybook') })],
        // Scan every story up front so Vite pre-bundles all their dependencies before the
        // browser starts. Otherwise a cold run (fresh clone, CI) reloads the page mid-test.
        optimizeDeps: {
          entries: ['src/renderer/**/*.stories.tsx'],
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
          ],
        },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
