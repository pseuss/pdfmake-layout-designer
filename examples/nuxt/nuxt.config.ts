export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // pdfmake runs in the server route; keep it external instead of bundling it into Nitro's output
  nitro: { externals: { external: ['pdfmake', 'pdf-lib'] } },
  vite: { optimizeDeps: { include: ['pdfmake'] } },
})
