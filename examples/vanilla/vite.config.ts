import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  publicDir: src('../../fixtures'),
  resolve: {
    alias: {
      '@pdf-layouter/core': src('../../packages/core/src/index.ts'),
      '@pdf-layouter/designer': src('../../packages/designer/src/index.ts'),
    },
  },
  server: { fs: { allow: [src('../..')] }, port: 5199, strictPort: true },
  build: { target: 'es2022' },
})
