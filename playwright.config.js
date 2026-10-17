import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: process.env.SAFEMARK_TEST_URL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.SAFEMARK_CHROME_CHANNEL ? { channel: process.env.SAFEMARK_CHROME_CHANNEL } : {}) } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: process.env.SAFEMARK_TEST_URL ? undefined : { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: true }
});
