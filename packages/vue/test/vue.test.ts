// @vitest-environment jsdom
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Layout } from 'pdfmake-layout-designer-core'
import { LayoutDesigner, type Designer } from '../src'

let app: App | undefined
let container: HTMLElement | undefined

afterEach(() => {
  app?.unmount()
  container?.remove()
  app = container = undefined
})

function mount(props: Record<string, unknown>) {
  container = document.createElement('div')
  document.body.append(container)
  const state = reactive(props)
  app = createApp({ render: () => h(LayoutDesigner, state as never) })
  app.mount(container)
  return { state, container }
}
const click = (c: HTMLElement, testId: string) => c.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click()

describe('Vue wrapper: content comparison', () => {
  it('a fresh copy of the emitted layout neither resets the Designer nor clears undo', async () => {
    let designer: Designer | undefined
    const state = reactive<Record<string, unknown>>({ modelValue: undefined, onReady: (d: Designer) => (designer = d) })
    state['onUpdate:modelValue'] = (l: Layout) => (state.modelValue = structuredClone(l)) // the host stores a copy
    container = document.createElement('div')
    document.body.append(container)
    app = createApp({ render: () => h(LayoutDesigner, state as never) })
    app.mount(container)
    click(container, 'add-rect')
    await nextTick()
    state.modelValue = JSON.parse(JSON.stringify(state.modelValue))
    await nextTick()
    expect(designer!.canUndo).toBe(true)
    expect(container.querySelectorAll('[data-type=rect]')).toHaveLength(1)
  })
})

describe('Vue wrapper (A3)', () => {
  it('mounts the Designer and removes it on unmount', () => {
    const { container: c } = mount({})
    expect(c.querySelectorAll('[data-testid=designer]')).toHaveLength(1)
    app!.unmount()
    expect(document.querySelectorAll('[data-testid=designer]')).toHaveLength(0)
    app = undefined
  })

  it('emits update:modelValue with the edited Layout JSON (v-model, A4)', () => {
    const emitted: Layout[] = []
    const { container: c } = mount({ modelValue: { schemaVersion: 1, locale: 'en-US' }, 'onUpdate:modelValue': (l: Layout) => emitted.push(l) })
    click(c, 'add-rect')
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.locale).toBe('en-US')
    expect(emitted[0]!.static.map((e) => e.type)).toEqual(['rect'])
  })

  it('applies a replaced modelValue without echoing, and accepts its own emitted value', async () => {
    const onUpdate = vi.fn()
    let designer: Designer | undefined
    const { state, container: c } = mount({ modelValue: { schemaVersion: 1 }, 'onUpdate:modelValue': onUpdate, onReady: (d: Designer) => (designer = d) })
    state.modelValue = { schemaVersion: 1, locale: 'fr-FR' }
    await nextTick()
    expect(designer!.getLayout().locale).toBe('fr-FR')
    expect(onUpdate).not.toHaveBeenCalled()

    click(c, 'add-rect')
    state.modelValue = onUpdate.mock.calls[0]![0]
    await nextTick()
    expect(c.querySelectorAll('[data-type=rect]')).toHaveLength(1)
  })

  it('starts empty and loads the layout once the host has fetched it (e.g. useFetch in Nuxt)', async () => {
    const saved: Layout[] = []
    let designer: Designer | undefined
    const { state, container: c } = mount({ modelValue: undefined, 'onUpdate:modelValue': (l: Layout) => saved.push(l), onReady: (d: Designer) => (designer = d) })
    expect(designer!.getLayout().static.map((e) => e.id)).toEqual(['pagenumber']) // a new Designer starts with the page number element
    state.modelValue = { schemaVersion: 1, locale: 'en-GB', static: [{ id: 'r', type: 'rect', x: 1, y: 1, w: 10, h: 10 }] }
    await nextTick()
    expect(c.querySelectorAll('[data-type=rect]')).toHaveLength(1)
    click(c, 'add-text')
    expect(saved).toHaveLength(1)
    expect(designer!.getLayout()).toEqual(saved[0])
  })

  it('forwards sample data and placeholders', async () => {
    const layout = { schemaVersion: 1, static: [{ id: 't', type: 'text', x: 10, y: 10, w: 50, content: 'Hi {{name}}' }] }
    let designer: Designer | undefined
    const { state, container: c } = mount({ modelValue: layout, sampleData: { name: 'Anna' }, onReady: (d: Designer) => (designer = d) })
    expect(c.querySelector('[data-id=t]')!.textContent).toBe('Hi Anna')
    state.sampleData = { name: 'Berta' }
    await nextTick()
    expect(c.querySelector('[data-id=t]')!.textContent).toBe('Hi Berta')
    state.placeholders = { groups: [{ key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }] }] }
    await nextTick()
    expect(designer!.getWarnings().map((w) => w.code)).toEqual(['unknown-placeholder'])
  })

  it('passes theme and primaryColor through and applies later changes', async () => {
    const { state, container: c } = mount({ theme: 'dark', primaryColor: '#0d9488' })
    const el = () => c.querySelector<HTMLElement>('[data-testid=designer]')!
    expect(el().getAttribute('data-theme')).toBe('dark')
    expect(el().style.getPropertyValue('--pld-primary')).toBe('#0d9488')
    state.theme = 'light'
    state.primaryColor = '#facc15'
    await nextTick()
    expect(el().getAttribute('data-theme')).toBe('light')
    expect(el().style.getPropertyValue('--pld-on-primary')).toBe('#111827')
  })

  it('renders on the server without touching the DOM (Nuxt SSR)', async () => {
    const html = await renderToString(createApp({ render: () => h(LayoutDesigner) }))
    expect(html).toBe('<div style="height:100%;"></div>')
  })
})
