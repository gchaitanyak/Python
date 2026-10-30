import { defineConfig } from 'vitest/config';

// Run via `npm run test:functions`, which builds functions and starts the Auth, Firestore and Functions emulators.
export default defineConfig({
  test: {
    include: ['tests/functions/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
