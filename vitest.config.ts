import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@pdf-layouter/core': src('./packages/core/src/index.ts'),
      '@pdf-layouter/designer': src('./packages/designer/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/examples/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
