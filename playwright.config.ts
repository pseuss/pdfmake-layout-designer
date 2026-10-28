import { defineConfig, devices } from '@playwright/test'

// `playwright test --project=chromium` should not build and start the Next.js and Nuxt example apps
const projectArgs = process.argv.filter((a) => a.startsWith('--project')).join(' ')
const wants = (name: string) => !projectArgs || projectArgs.includes(name)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', viewport: { width: 1600, height: 1000 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /(production|frameworks)\.spec\.ts/ },
    // the same demo as a production bundle (Rollup, minified): checks that pdfmake and Tiptap bundle correctly
    // the real Next.js and Nuxt example apps (SSR, API routes, load/save round trip)
    { name: 'next', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5301' }, testMatch: /(frameworks|generator)\.spec\.ts/ },
    { name: 'nuxt', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5302' }, testMatch: /(frameworks|generator)\.spec\.ts/ },
    { name: 'production', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5198' }, testMatch: /production\.spec\.ts/ },
  ],
  webServer: [
    ...(wants('next') ? [{ command: 'pnpm --filter example-next build && pnpm --filter example-next start', url: 'http://localhost:5301', reuseExistingServer: !process.env.CI, timeout: 240_000 }] : []),
    ...(wants('nuxt') ? [{ command: 'pnpm --filter example-nuxt build && pnpm --filter example-nuxt start', url: 'http://localhost:5302', reuseExistingServer: !process.env.CI, timeout: 240_000 }] : []),
    { command: 'pnpm exec vite examples/vanilla', url: 'http://localhost:5199', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    ...(wants('production') ? [{
      command: 'pnpm exec vite build examples/vanilla && pnpm exec vite preview examples/vanilla --port 5198 --strictPort',
      url: 'http://localhost:5198',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }] : []),
  ],
})
