import { describe, expect, it } from 'vitest'
import pdfLayouterModule from '../src/nuxt'

function setup(options: Record<string, unknown> = {}) {
  const hooks: Record<string, (components: Record<string, unknown>[]) => void> = {}
  const nuxt = { options, hook: (name: string, cb: (components: Record<string, unknown>[]) => void) => void (hooks[name] = cb) }
  pdfLayouterModule({}, nuxt as never)
  return { options, hooks }
}

describe('Nuxt module', () => {
  it('keeps pdfmake and pdf-lib out of the Nitro bundle and pre-bundles pdfmake for the browser', () => {
    const { options } = setup()
    expect((options.nitro as any).externals.external).toEqual(['pdfmake', 'pdf-lib'])
    expect((options.vite as any).optimizeDeps.include).toEqual(['pdfmake'])
  })

  it('merges with the app\'s own settings', () => {
    const { options } = setup({ nitro: { externals: { external: ['sharp'], inline: ['x'] } }, vite: { optimizeDeps: { include: ['y'] } } })
    expect((options.nitro as any).externals).toEqual({ external: ['sharp', 'pdfmake', 'pdf-lib'], inline: ['x'] })
    expect((options.vite as any).optimizeDeps.include).toEqual(['y', 'pdfmake'])
  })

  it('auto-imports <LayoutDesigner>', () => {
    const { hooks } = setup()
    const components: Record<string, unknown>[] = []
    hooks['components:extend']!(components)
    expect(components).toHaveLength(1)
    expect(components[0]).toMatchObject({ pascalName: 'LayoutDesigner', export: 'LayoutDesigner', filePath: '@pdf-layouter/vue' })
  })
})
