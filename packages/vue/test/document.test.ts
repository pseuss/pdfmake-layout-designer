// @vitest-environment jsdom
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { Layout } from '@pdf-layouter/core'
import { useLayoutDocument } from '../src'

describe('useLayoutDocument (Vue)', () => {
  it('starts from the layout that SSR already loaded, turns v-model writes into edits and saves them', async () => {
    const save = vi.fn(async () => {})
    const doc = useLayoutDocument({ initial: { schemaVersion: 1, locale: 'de-DE' } as Layout, save })
    expect(doc.status.value).toBe('loaded')
    doc.layout.value = { schemaVersion: 1, locale: 'en-US' } as Layout // what <LayoutDesigner v-model> does
    await nextTick()
    expect(doc.status.value).toBe('dirty')
    await doc.save()
    expect(save).toHaveBeenCalledWith({ schemaVersion: 1, locale: 'en-US' })
    expect(doc.status.value).toBe('saved')
  })

  it('shows the fallback as "new" and a failing save as "error"', async () => {
    const doc = useLayoutDocument({ initial: null, fallback: { schemaVersion: 1 }, save: async () => { throw new Error('nope') } })
    expect(doc.status.value).toBe('new')
    expect(doc.layout.value).toEqual({ schemaVersion: 1 })
    doc.layout.value = { schemaVersion: 1, locale: 'fr-FR' } as Layout
    await nextTick()
    await doc.save()
    expect(doc.status.value).toBe('error')
    expect(doc.error.value?.message).toBe('nope')
  })
})
