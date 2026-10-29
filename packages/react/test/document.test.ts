// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Layout } from 'pdfmake-layout-designer-core'
import { useLayoutDocument, type UseLayoutDocument } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mountHook(options: Parameters<typeof useLayoutDocument>[0]) {
  const result: { current?: UseLayoutDocument } = {}
  const Probe = () => ((result.current = useLayoutDocument(options)), null)
  const root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(Probe)))
  return { result, unmount: () => act(() => root.unmount()) }
}

describe('useLayoutDocument (React)', () => {
  it('loads, tracks edits and saves through the Host App\'s functions', async () => {
    const save = vi.fn(async () => {})
    const { result } = mountHook({ load: async () => ({ schemaVersion: 1, locale: 'en-GB' }) as Layout, save })
    expect(result.current!.status).toBe('loading')
    await act(async () => void (await Promise.resolve()))
    expect(result.current!.status).toBe('loaded')
    expect((result.current!.value as Layout).locale).toBe('en-GB')

    act(() => result.current!.onChange({ schemaVersion: 1, locale: 'en-US' } as Layout))
    expect(result.current!.status).toBe('dirty')
    await act(async () => result.current!.save())
    expect(save).toHaveBeenCalledWith({ schemaVersion: 1, locale: 'en-US' })
    expect(result.current!.status).toBe('saved')
  })

  it('uses the newest save function of the latest render', async () => {
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const result: { current?: UseLayoutDocument } = {}
    const Probe = ({ save }: { save: () => Promise<void> }) => ((result.current = useLayoutDocument({ initial: { schemaVersion: 1 }, save })), null)
    const root = createRoot(document.createElement('div'))
    act(() => root.render(createElement(Probe, { save: first })))
    act(() => root.render(createElement(Probe, { save: second })))
    await act(async () => result.current!.save())
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })
})
