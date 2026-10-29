import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  publicDir: src('../../fixtures'),
  resolve: {
    alias: {
      'pdfmake-layout-designer-core': src('../../packages/core/src/index.ts'),
      'pdfmake-layout-designer': src('../../packages/designer/src/index.ts'),
    },
  },
  server: { host: true, fs: { allow: [src('../..')] }, port: 5199, strictPort: true },
  preview: { host: true },
  build: { target: 'es2022', rollupOptions: { input: { main: src('./index.html'), generator: src('./generator.html') } } },
})
