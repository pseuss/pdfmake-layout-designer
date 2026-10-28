export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  // keeps pdfmake out of the Nitro bundle (generate() in server routes), and auto-imports <LayoutDesigner>
  modules: ['@pdf-layouter/vue/nuxt'],
  // examples/shared sits outside the Nuxt project: bundle it into the server instead of importing it by path (matters in dev)
  nitro: { externals: { inline: [/examples\/shared\//] } },
})
