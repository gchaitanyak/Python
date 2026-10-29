import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 740 } } },
  ],
  // Firebase emulators (Auth, Firestore, Functions) + the Vite dev server, which talks to them.
  webServer: [
    {
      command:
        'npm --prefix functions run build && npx firebase emulators:start --only auth,firestore,functions --project demo-python-exercises',
      // Ready once the functions have loaded, not just when the emulator hub is up.
      url: 'http://127.0.0.1:5001/demo-python-exercises/us-central1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // SIGTERM lets the Firebase CLI stop its Java emulators; a hard kill leaves them holding the ports.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command: 'npm run dev:web -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
