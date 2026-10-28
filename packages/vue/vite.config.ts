import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: { index: 'src/index.ts', nuxt: 'src/nuxt.ts' }, formats: ['es', 'cjs'], fileName: (format, entry) => `${entry}.${format === 'es' ? 'js' : 'cjs'}` },
    rollupOptions: { external: [/^@pdf-layouter\//, /^vue(\/|$)/] },
    sourcemap: true,
    minify: false,
  },
})
