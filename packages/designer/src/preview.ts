import { generate, type FontRegistry } from '@pdf-layouter/core'
import { clear, h } from './dom'
import type { Translator } from './i18n'
import type { Store } from './store'

/** Live PDF preview: renders the Layout with the sample data through the Generator and shows it in an iframe. */
export class Preview {
  readonly element: HTMLElement
  private frame: HTMLIFrameElement
  private status: HTMLElement
  private url: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private run = 0
  private pdf: Uint8Array | undefined
  active = false

  constructor(
    private store: Store,
    private t: Translator,
    private fonts: FontRegistry,
    private debounceMs = 400,
  ) {
    this.frame = h('iframe', { title: t('tab.preview'), 'data-testid': 'preview-frame' })
    this.status = h('div', { class: 'pld-muted', 'data-testid': 'preview-status' })
    this.element = h(
      'div',
      { class: 'pld-preview', 'data-testid': 'panel-preview' },
      h('div', { class: 'pld-row' }, h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': 'preview-refresh', onClick: () => void this.refresh() }, t('preview.refresh')), this.status),
      this.frame,
    )
  }

  getPdf(): Uint8Array | undefined {
    return this.pdf
  }

  /** Re-render after a pause; only while the preview tab is open. */
  schedule(): void {
    if (!this.active) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.refresh(), this.debounceMs)
  }

  async refresh(): Promise<Uint8Array | undefined> {
    clearTimeout(this.timer)
    const run = ++this.run
    this.status.textContent = this.t('preview.rendering')
    try {
      const pdf = await generate(this.store.getLayout(), this.store.sampleData, { fonts: this.fonts })
      if (run !== this.run) return undefined // a newer render superseded this one
      this.pdf = pdf
      const next = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      if (this.url) URL.revokeObjectURL(this.url)
      this.url = next
      this.frame.src = next
      this.status.textContent = ''
      this.status.classList.remove('pld-error')
      return pdf
    } catch (error) {
      if (run === this.run) {
        this.status.classList.add('pld-error')
        clear(this.status)
        this.status.append(`${this.t('preview.error')}: ${error instanceof Error ? error.message : String(error)}`)
      }
      return undefined
    }
  }

  destroy(): void {
    clearTimeout(this.timer)
    this.run++
    if (this.url) URL.revokeObjectURL(this.url)
  }
}
