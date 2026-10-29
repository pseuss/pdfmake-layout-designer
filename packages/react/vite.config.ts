import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', next: 'src/next.ts' }, formats: ['es', 'cjs'], fileName: (format, entry) => `${entry}.${format === 'es' ? 'js' : 'cjs'}` },
    rollupOptions: {
      external: [/^pdfmake-layout-designer(-|$)/, /^react(\/|$)/],
      // Next.js: the wrapper uses hooks, so it must be a Client Component module
      output: { banner: (chunk) => (chunk.name === 'index' ? '"use client";' : '') },
    },
    sourcemap: true,
    minify: false,
  },
})
