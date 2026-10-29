// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layout } from 'pdfmake-layout-designer-core'
import { LayoutDesigner, type Designer } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props: Parameters<typeof LayoutDesigner>[0]) => act(() => root.render(createElement(LayoutDesigner, props)))
const click = (testId: string) => act(() => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click())

describe('React wrapper (A3)', () => {
  it('mounts the Designer into its element and removes it on unmount', () => {
    render({})
    expect(container.querySelectorAll('[data-testid=designer]')).toHaveLength(1)
    act(() => root.unmount())
    expect(document.querySelectorAll('[data-testid=designer]')).toHaveLength(0)
    root = createRoot(container)
  })

  it('shows the given layout and emits the edited JSON through onChange (A4)', () => {
    const onChange = vi.fn()
    render({ value: { schemaVersion: 1, locale: 'en-US' }, onChange })
    expect(onChange).not.toHaveBeenCalled()
    click('add-rect')
    expect(onChange).toHaveBeenCalledTimes(1)
    const emitted = onChange.mock.calls[0]![0] as Layout
    expect(emitted.locale).toBe('en-US')
    expect(emitted.static.map((e) => e.type)).toEqual(['rect'])
  })

  it('applies a new value from the host without echoing it back through onChange', () => {
    const onChange = vi.fn()
    let designer: Designer | undefined
    render({ value: { schemaVersion: 1 }, onChange, onReady: (d) => (designer = d) })
    render({ value: { schemaVersion: 1, locale: 'fr-FR' }, onChange, onReady: (d) => (designer = d) })
    expect(designer!.getLayout().locale).toBe('fr-FR')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('starts empty and loads the layout once the host has fetched it (e.g. from a database), then exposes edits for saving', () => {
    const saved: Layout[] = []
    let designer: Designer | undefined
    const props = (value?: Layout) => ({ value, onChange: (l: Layout) => saved.push(l), onReady: (d: Designer) => (designer = d) })
    render(props(undefined)) // page rendered, request still running
    expect(designer!.getLayout().static.map((e) => e.id)).toEqual(['pagenumber']) // a new Designer starts with the page number element
    const fromDb = { schemaVersion: 1, locale: 'en-GB', static: [{ id: 'r', type: 'rect', x: 1, y: 1, w: 10, h: 10 }] } as unknown as Layout
    render(props(fromDb)) // request finished
    expect(container.querySelectorAll('[data-type=rect]')).toHaveLength(1)
    expect(designer!.getLayout().locale).toBe('en-GB')
    click('add-text')
    expect(saved).toHaveLength(1) // onChange carries the edited JSON for the save function
    expect(designer!.getLayout()).toEqual(saved[0]) // getLayout() is the same JSON at any time
    expect(saved[0]!.static.map((e) => e.type)).toEqual(['rect', 'text'])
  })

  it('does not reset the Designer when the host feeds the emitted layout back (controlled usage)', () => {
    let current: Layout | undefined
    const props = () => ({ value: current, onChange: (l: Layout) => (current = l) })
    render(props())
    click('add-rect')
    render(props()) // re-render with the emitted layout as value
    expect(container.querySelectorAll('[data-type=rect]')).toHaveLength(1)
    click('add-text')
    render(props())
    expect(current!.static.map((e) => e.type)).toEqual(['text', 'rect', 'text']) // page number element, then the two added
  })

  it('compares by content: a fresh copy of the emitted layout every render neither resets the Designer nor clears undo', () => {
    let designer: Designer | undefined
    let current: Layout | undefined
    const props = () => ({ value: current && structuredClone(current), onChange: (l: Layout) => (current = l), onReady: (d: Designer) => (designer = d) })
    render(props())
    click('add-rect')
    render(props()) // new object, same content
    render(props())
    expect(designer!.canUndo).toBe(true) // setLayout() would have cleared the history
    expect(container.querySelectorAll('[data-type=rect]')).toHaveLength(1)
  })

  it('still applies a value whose content really differs', () => {
    let designer: Designer | undefined
    render({ value: { schemaVersion: 1 }, onReady: (d) => (designer = d) })
    click('add-rect')
    render({ value: { schemaVersion: 1, locale: 'it-IT' }, onReady: (d) => (designer = d) })
    expect(designer!.getLayout().locale).toBe('it-IT')
    expect(designer!.canUndo).toBe(false)
  })

  it('forwards sample data and placeholder catalogs to the Designer', () => {
    let designer: Designer | undefined
    const layout = { schemaVersion: 1, static: [{ id: 't', type: 'text', x: 10, y: 10, w: 50, content: 'Hi {{name}}' }] } as const
    render({ value: layout as never, sampleData: { name: 'Anna' }, onReady: (d) => (designer = d) })
    expect(container.querySelector('[data-id=t]')!.textContent).toBe('Hi Anna')
    render({ value: layout as never, sampleData: { name: 'Berta' }, onReady: (d) => (designer = d) })
    expect(container.querySelector('[data-id=t]')!.textContent).toBe('Hi Berta')
    expect(designer!.getWarnings()).toEqual([])
    render({ value: layout as never, sampleData: { name: 'Berta' }, placeholders: { groups: [{ key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }] }] } })
    expect(designer!.getWarnings().map((w) => w.code)).toEqual(['unknown-placeholder'])
  })

  it('passes theme and primaryColor through and applies later changes', () => {
    const el = () => container.querySelector<HTMLElement>('[data-testid=designer]')!
    render({ theme: 'dark', primaryColor: '#0d9488' })
    expect(el().getAttribute('data-theme')).toBe('dark')
    expect(el().style.getPropertyValue('--pld-primary')).toBe('#0d9488')
    render({ theme: 'light', primaryColor: '#facc15' })
    expect(el().getAttribute('data-theme')).toBe('light')
    expect(el().style.getPropertyValue('--pld-on-primary')).toBe('#111827')
  })

  it('survives React StrictMode double mounting with exactly one Designer', () => {
    act(() => root.render(createElement(StrictMode, null, createElement(LayoutDesigner, {}))))
    expect(container.querySelectorAll('[data-testid=designer]')).toHaveLength(1)
  })

  it('renders on the server without touching the DOM (Next.js SSR)', () => {
    const html = renderToString(createElement(LayoutDesigner, { className: 'x' }))
    expect(html).toBe('<div class="x" style="height:100%"></div>')
  })
})
