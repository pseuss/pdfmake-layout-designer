export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // pdfmake runs in the server route; keep it external instead of bundling it into Nitro's output
  // examples/shared sits outside the Nuxt project: bundle it into the server instead of importing it by path (matters in dev)
  nitro: { externals: { external: ['pdfmake', 'pdf-lib'], inline: [/examples\/shared\//] } },
  vite: { optimizeDeps: { include: ['pdfmake'] } },
})
