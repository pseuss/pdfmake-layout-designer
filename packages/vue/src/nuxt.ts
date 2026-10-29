/** The packages the Generator needs as plain Node dependencies on the server (pdfmake loads its own fonts and workers). */
const SERVER_EXTERNAL = ['pdfmake', 'pdf-lib']

interface NuxtLike {
  options: {
    nitro?: { externals?: { external?: string[] } & Record<string, unknown> } & Record<string, unknown>
    vite?: { optimizeDeps?: { include?: string[] } & Record<string, unknown> } & Record<string, unknown>
  }
  hook(name: 'components:extend', callback: (components: Record<string, unknown>[]) => void): void
}

/**
 * Nuxt module: `modules: ['pdfmake-layout-designer-vue/nuxt']` in `nuxt.config.ts`.
 * It keeps pdfmake and pdf-lib out of the Nitro bundle (so `generate()` works in server routes),
 * pre-bundles pdfmake for the browser preview in dev, and auto-imports `<LayoutDesigner>`.
 */
export default function pdfmakeLayoutDesignerModule(_options: unknown, nuxt: NuxtLike): void {
  const nitro = (nuxt.options.nitro ??= {})
  const externals = (nitro.externals ??= {})
  externals.external = [...new Set([...(externals.external ?? []), ...SERVER_EXTERNAL])]

  const vite = (nuxt.options.vite ??= {})
  const optimizeDeps = (vite.optimizeDeps ??= {})
  optimizeDeps.include = [...new Set([...(optimizeDeps.include ?? []), 'pdfmake'])]

  nuxt.hook('components:extend', (components) => {
    components.push({
      pascalName: 'LayoutDesigner',
      kebabName: 'layout-designer',
      export: 'LayoutDesigner',
      filePath: 'pdfmake-layout-designer-vue',
      shortPath: 'pdfmake-layout-designer-vue',
      chunkName: 'components/layout-designer',
      prefetch: false,
      preload: false,
      global: false,
      island: false,
      mode: 'all',
    })
  })
}

export const meta = { name: 'pdfmake-layout-designer', configKey: 'pdfmakeLayoutDesigner' }
