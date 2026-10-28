import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', viewport: { width: 1600, height: 1000 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /production\.spec\.ts/ },
    // the same demo as a production bundle (Rollup, minified): checks that pdfmake and Tiptap bundle correctly
    { name: 'production', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5198' }, testMatch: /production\.spec\.ts/ },
  ],
  webServer: [
    { command: 'pnpm exec vite examples/vanilla', url: 'http://localhost:5199', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    {
      command: 'pnpm exec vite build examples/vanilla && pnpm exec vite preview examples/vanilla --port 5198 --strictPort',
      url: 'http://localhost:5198',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
