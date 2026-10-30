import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import storybook from 'eslint-plugin-storybook';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['out', 'dist', 'storybook-static', 'src/renderer/routeTree.gen.ts']),

  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // Main process, preload and build config run in Node.
  {
    files: ['src/main/**', 'src/preload/**', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Renderer and Storybook run in the browser.
  {
    files: ['src/renderer/**/*.{ts,tsx}', '.storybook/**/*.ts'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  storybook.configs['flat/recommended'],
  {
    files: ['**/*.stories.tsx'],
    // Off while the component stories are placeholders. Turn back on once each file has a story.
    rules: { 'storybook/story-exports': 'off' },
  },

  // Last, so formatting rules defer to Prettier.
  prettier,
]);
