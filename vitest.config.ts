import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'pdfmake-layout-designer-core': src('./packages/core/src/index.ts'),
      'pdfmake-layout-designer': src('./packages/designer/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
