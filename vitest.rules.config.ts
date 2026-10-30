import { defineConfig } from 'vitest/config';

// Run via `npm run test:rules`, which starts the Firestore emulator first.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
  },
});
