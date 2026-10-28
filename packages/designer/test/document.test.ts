import { describe, expect, it, vi } from 'vitest'
import type { Layout } from '@pdf-layouter/core'
import { LayoutDocument } from '../src/document'

const layout = (locale: string) => ({ schemaVersion: 1, locale }) as unknown as Layout
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

describe('LayoutDocument: load, edit, save', () => {
  it('starts "loaded" with a layout that is already known (e.g. from SSR)', () => {
    const doc = new LayoutDocument({ initial: layout('de-DE'), save: async () => {} })
    expect(doc.snapshot).toMatchObject({ status: 'loaded', value: layout('de-DE') })
  })

  it('starts "new" with the fallback when nothing is stored', () => {
    const fallback = { schemaVersion: 1 as const, locale: 'fr-FR' }
    const doc = new LayoutDocument({ initial: null, fallback, save: async () => {} })
    expect(doc.snapshot).toMatchObject({ status: 'new', value: fallback })
  })

  it('loads asynchronously: "loading", then "loaded" or "new"', async () => {
    const stored = deferred<Layout | null>()
    const doc = new LayoutDocument({ load: () => stored.promise, fallback: { schemaVersion: 1 }, save: async () => {} })
    expect(doc.snapshot.status).toBe('loading')
    stored.resolve(layout('it-IT'))
    await vi.waitFor(() => expect(doc.snapshot.status).toBe('loaded'))
    expect(doc.snapshot.value).toEqual(layout('it-IT'))

    const empty = new LayoutDocument({ load: async () => null, fallback: { schemaVersion: 1 }, save: async () => {} })
    await vi.waitFor(() => expect(empty.snapshot.status).toBe('new'))
  })

  it('keeps edits made while the stored layout is still loading', async () => {
    const stored = deferred<Layout | null>()
    const doc = new LayoutDocument({ load: () => stored.promise, save: async () => {} })
    doc.change(layout('es-ES'))
    stored.resolve(layout('old'))
    await Promise.resolve()
    expect(doc.snapshot).toMatchObject({ status: 'dirty', value: layout('es-ES') })
  })

  it('an edit makes it dirty; save() hands the latest edit to the Host App and ends "saved"', async () => {
    const save = vi.fn(async () => {})
    const doc = new LayoutDocument({ initial: layout('a'), save })
    const seen: string[] = []
    doc.subscribe(() => seen.push(doc.snapshot.status))
    doc.change(layout('b'))
    await doc.save()
    expect(save).toHaveBeenCalledWith(layout('b'))
    expect(seen).toEqual(['dirty', 'saving', 'saved'])
  })

  it('stays dirty when the user edits while the save request is running', async () => {
    const request = deferred<void>()
    const doc = new LayoutDocument({ initial: layout('a'), save: () => request.promise })
    doc.change(layout('b'))
    const saving = doc.save()
    doc.change(layout('c'))
    request.resolve()
    await saving
    expect(doc.snapshot.status).toBe('dirty')
  })

  it('reports a failing save as "error" with the error, and can be retried', async () => {
    let fail = true
    const doc = new LayoutDocument({ initial: layout('a'), save: async () => { if (fail) throw new Error('disk full') } })
    doc.change(layout('b'))
    await doc.save()
    expect(doc.snapshot.status).toBe('error')
    expect(doc.snapshot.error?.message).toBe('disk full')
    fail = false
    await doc.save()
    expect(doc.snapshot).toMatchObject({ status: 'saved', error: undefined })
  })

  it('does nothing when there is nothing to save', async () => {
    const save = vi.fn()
    await new LayoutDocument({ save }).save()
    expect(save).not.toHaveBeenCalled()
  })
})
