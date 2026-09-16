// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'static-catalog.spec.mjs',
  outputDir: '../../output/playwright/site-results',
  workers: 1,
  retries: 0,
  use: { headless: true, baseURL: 'http://site.test' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
