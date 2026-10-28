import type { Layout, LayoutInput } from '@pdf-layouter/core'

export type DocumentStatus = 'loading' | 'new' | 'loaded' | 'dirty' | 'saving' | 'saved' | 'error'

export interface LayoutDocumentOptions {
  /** Fetches the stored Layout (null / undefined: nothing stored yet). Omit when `initial` is already known, e.g. loaded during SSR. */
  load?: () => Promise<Layout | LayoutInput | null | undefined>
  /** The stored Layout when the Host App has it already; null / undefined: nothing stored. */
  initial?: Layout | LayoutInput | null
  /** The Layout to start from when nothing is stored. */
  fallback?: LayoutInput
  /** The Host App's own save function (write the JSON wherever you like). */
  save: (layout: Layout) => Promise<void> | void
}

export interface LayoutDocumentState {
  /** Hand this to the Designer's `value`. */
  value: Layout | LayoutInput | undefined
  status: DocumentStatus
  error: Error | undefined
}

/**
 * The load → edit → save workflow of one stored Layout, independent of any framework:
 * wire `change` to the Designer's `onChange`, show `status`, call `save()`. Storage stays with the Host App.
 */
export class LayoutDocument {
  private state: LayoutDocumentState
  private latest: Layout | LayoutInput | undefined
  private listeners = new Set<() => void>()
  private revision = 0

  constructor(private options: LayoutDocumentOptions) {
    const stored = options.initial
    this.latest = stored ?? options.fallback
    this.state = { value: this.latest, status: options.load ? 'loading' : stored ? 'loaded' : 'new', error: undefined }
    if (options.load) void this.reload()
  }

  /** Snapshot for UI frameworks; a new object whenever something changed. */
  get snapshot(): LayoutDocumentState {
    return this.state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** (Re)loads the stored Layout; edits made while loading win over the loaded value. */
  async reload(): Promise<void> {
    const load = this.options.load
    if (!load) return
    const started = this.revision
    try {
      const stored = await load()
      if (this.revision !== started) return // the user already edited: keep their work
      this.latest = stored ?? this.options.fallback
      this.set({ value: this.latest, status: stored ? 'loaded' : 'new', error: undefined })
    } catch (error) {
      this.set({ ...this.state, status: 'error', error: toError(error) })
    }
  }

  /** The Designer's `onChange`. */
  change = (layout: Layout): void => {
    this.revision++
    this.latest = layout
    this.set({ value: layout, status: 'dirty', error: undefined })
  }

  /** Saves the latest edit with the Host App's save function. */
  async save(): Promise<void> {
    if (!this.latest) return
    const saving = this.revision
    this.set({ ...this.state, status: 'saving', error: undefined })
    try {
      await this.options.save(this.latest as Layout)
      // an edit during the request keeps the document dirty
      this.set({ ...this.state, status: this.revision === saving ? 'saved' : 'dirty' })
    } catch (error) {
      this.set({ ...this.state, status: 'error', error: toError(error) })
    }
  }

  private set(state: LayoutDocumentState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))
