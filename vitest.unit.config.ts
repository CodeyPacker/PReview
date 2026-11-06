import { defineConfig } from 'vitest/config';

// Loads no Storybook code, so these tests run where Storybook's packages can't be found, such as
// an agent's sandbox.
export default defineConfig({
  // Main-process and shared code, plus renderer tests that render to a string, run in Node.
  test: {
    name: 'unit',
    environment: 'node',
    // Tests that run real git can take seconds on Windows while other files run alongside.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      'src/main/**/*.test.ts',
      'src/shared/**/*.test.ts',
      'src/renderer/**/*.test.{ts,tsx}',
    ],
  },
});
