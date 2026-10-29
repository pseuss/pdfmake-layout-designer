import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es', 'cjs'], fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs') },
    rollupOptions: { external: [/^pdfmake-layout-designer-core/, /^@tiptap\//, /^prosemirror-/] },
    sourcemap: true,
    minify: false,
  },
})
