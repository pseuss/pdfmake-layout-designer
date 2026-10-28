import { createEmptyLayout, parseLayout, type Data, type FontRegistry, type Layout, type LayoutInput } from '@pdf-layouter/core'
import { deleteSelection, duplicateSelection, moveFlow, nudgeSelection } from './actions'
import { Canvas } from './canvas'
import { clear, h, isEditable } from './dom'
import { newAddress, newFlow, newImage, newLine, newRect, newText } from './elements'
import { loadCanvasFonts } from './fonts'
import { dataUrlKb, DEFAULT_IMAGE_OPTIONS, processImage, type ImageOptions } from './images'
import { createTranslator, type Locale, type MessageKey, type Translator } from './i18n'
import { Inspector } from './inspector'
import { Preview } from './preview'
import { Store } from './store'
import { injectStyles } from './styles'
import { collectWarnings, type DesignerWarning, type PlaceholderCatalog } from './warnings'

export interface DesignerOptions {
  container: HTMLElement
  /** Stored Layout JSON; an empty A4 layout when omitted. */
  layout?: LayoutInput | Layout
  /** Placeholder catalog of the Host App. */
  placeholders?: PlaceholderCatalog
  /** Data for the live preview and the canvas. */
  sampleData?: Data
  locale?: Locale
  /** The Host App's fonts (URLs in the browser). */
  fonts?: FontRegistry
  images?: Partial<ImageOptions>
  /** Called after every edit made in the UI with the current self-contained Layout JSON. */
  onChange?: (layout: Layout) => void
}

type Tab = 'properties' | 'page' | 'preview'

export class Designer {
  /** Resolves when the Host App's fonts have been loaded for the canvas. */
  readonly ready: Promise<void>
  private store: Store
  private t: Translator
  private canvas: Canvas
  private inspector: Inspector
  private preview: Preview
  private root: HTMLElement
  private flowList = h('div', { class: 'pld-list', 'data-testid': 'flow-list' })
  private staticList = h('div', { class: 'pld-list', 'data-testid': 'static-list' })
  private warningsEl = h('div', { class: 'pld-warnings', 'data-testid': 'warnings' })
  private zoomLabel = h('span', { class: 'pld-muted', 'data-testid': 'zoom-label' })
  private tabs: Record<Tab, HTMLElement> = {} as Record<Tab, HTMLElement>
  private panels: Record<Tab, HTMLElement>
  private fileInput: HTMLInputElement
  private pendingReplace: string | undefined
  private unsubscribe: (() => void)[] = []
  private imageOptions: ImageOptions
  private destroyed = false

  constructor(private options: DesignerOptions) {
    injectStyles(options.container.ownerDocument)
    this.t = createTranslator(options.locale ?? 'de')
    this.imageOptions = { ...DEFAULT_IMAGE_OPTIONS, ...options.images }
    this.store = new Store(options.layout ? parseLayout(options.layout) : createEmptyLayout())
    this.store.catalog = options.placeholders
    this.store.sampleData = options.sampleData ?? {}
    const fonts = options.fonts ?? []

    const readout = h('span', { class: 'pld-readout', 'data-testid': 'readout' })
    this.canvas = new Canvas(this.store, this.t, readout)
    this.inspector = new Inspector({ store: this.store, t: this.t, fonts, pickImage: (replace) => this.pickImage(replace) })
    this.preview = new Preview(this.store, this.t, fonts)
    this.fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', hidden: true, 'data-testid': 'file-input' })
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0]
      const replace = this.pendingReplace
      this.fileInput.value = ''
      this.pendingReplace = undefined
      if (file) void this.addImage(file, { replace })
    })

    this.panels = { properties: this.inspector.propsEl, page: this.inspector.pageEl, preview: this.preview.element }
    this.root = h(
      'div',
      { class: 'pld-root', tabIndex: -1, 'data-testid': 'designer' },
      this.buildLeft(),
      h('div', { class: 'pld-center' }, this.buildToolbar(readout), this.canvas.stage, this.warningsEl),
      this.buildRight(),
      this.fileInput,
    )
    options.container.append(this.root)
    this.root.addEventListener('keydown', (e) => this.onKeyDown(e))

    this.unsubscribe.push(
      this.store.on('layout', ({ source }) => {
        this.canvas.render()
        this.renderLists()
        this.renderWarnings()
        if (!source.startsWith('panel')) this.inspector.render()
        this.preview.schedule()
        if (source !== 'api') this.options.onChange?.(this.store.getLayout())
      }),
      this.store.on('selection', () => {
        this.canvas.render()
        this.renderLists()
        this.inspector.render()
        if (this.store.selection.kind !== 'none' && this.activeTab !== 'properties') this.setTab('properties')
      }),
      this.store.on('view', () => {
        this.canvas.render()
        this.zoomLabel.textContent = `${Math.round(this.store.zoom * 100)} %`
        this.syncToolbar()
      }),
      this.store.on('data', () => {
        this.canvas.render()
        this.renderWarnings()
        this.preview.schedule()
      }),
    )

    this.setTab('properties')
    this.canvas.render()
    this.renderLists()
    this.renderWarnings()
    this.zoomLabel.textContent = `${Math.round(this.store.zoom * 100)} %`
    this.syncToolbar()
    this.ready = loadCanvasFonts(fonts, options.container.ownerDocument).then(() => {
      if (!this.destroyed) this.canvas.render()
    })
  }

  // ---- public API ---------------------------------------------------------------------------

  /** The current Layout as self-contained JSON (unused assets removed). */
  getLayout(): Layout {
    return this.store.getLayout()
  }

  setLayout(layout: LayoutInput | Layout): void {
    this.store.setLayout(layout)
  }

  setSampleData(data: Data): void {
    this.store.setSampleData(data)
  }

  setPlaceholders(catalog: PlaceholderCatalog | undefined): void {
    this.store.catalog = catalog
    this.inspector.render()
    this.renderWarnings()
  }

  /** Notes about placeholders without a value or catalog entry and about oversized images. */
  getWarnings(): DesignerWarning[] {
    const layout = this.store.layout
    const warnings = collectWarnings(layout, this.store.sampleData, this.store.catalog)
    for (const [key, asset] of Object.entries(layout.assets)) {
      const kb = asset.data.startsWith('data:') ? dataUrlKb(asset.data) : asset.data.length / 1024
      if (kb > this.imageOptions.warnAboveKb) warnings.push({ code: 'large-image', message: this.t('image.tooLarge', { kb: this.imageOptions.warnAboveKb }) + ` (${key}: ${Math.round(kb)} KB)`, where: key })
    }
    return warnings
  }

  /**
   * Adds an image to the Layout (optimised, see `images` option) as a new element,
   * or replaces the bitmap of the asset given in `replace`.
   */
  async addImage(file: Blob, options: { replace?: string } = {}): Promise<void> {
    const image = await processImage(file, this.imageOptions)
    if (options.replace && this.store.layout.assets[options.replace]) {
      const key = options.replace
      this.store.update((d) => {
        d.assets[key] = { data: image.data, w: image.w, h: image.h }
      })
      return
    }
    const asset = this.store.uniqueAssetId()
    const id = this.store.uniqueId('image')
    this.store.update((d) => {
      d.assets[asset] = { data: image.data, w: image.w, h: image.h }
      d.static.push(newImage(id, asset, image.w, image.h))
    })
    this.store.select({ kind: 'static', id })
  }

  /** Renders the preview now and returns the PDF bytes. */
  refreshPreview(): Promise<Uint8Array | undefined> {
    return this.preview.refresh()
  }

  getPreviewPdf(): Uint8Array | undefined {
    return this.preview.getPdf()
  }

  destroy(): void {
    this.destroyed = true
    this.unsubscribe.forEach((u) => u())
    this.preview.destroy()
    this.root.remove()
  }

  // ---- UI construction --------------------------------------------------------------------------

  private get activeTab(): Tab {
    return (Object.keys(this.tabs) as Tab[]).find((t) => this.tabs[t].getAttribute('aria-selected') === 'true') ?? 'properties'
  }

  private pickImage(replace?: string): void {
    this.pendingReplace = replace
    this.fileInput.click()
  }

  private addStatic(build: (id: string) => Layout['static'][number], prefix: string): void {
    const id = this.store.uniqueId(prefix)
    this.store.update((d) => void d.static.push(build(id)))
    this.store.select({ kind: 'static', id })
  }

  private addFlow(type: Layout['flow'][number]['type']): void {
    const block = newFlow(type, this.store.catalog?.lists)
    this.store.update((d) => void d.flow.push(block))
    this.store.select({ kind: 'flow', index: this.store.layout.flow.length - 1 })
  }

  private buildLeft(): HTMLElement {
    const T = this.t
    const btn = (key: MessageKey, testId: string, run: () => void) => h('button', { type: 'button', class: 'pld-btn', 'data-testid': testId, onClick: run }, T(key))
    return h(
      'div',
      { class: 'pld-left', 'data-testid': 'sidebar' },
      h('div', null, h('div', { class: 'pld-section-title' }, `${T('add.title')} · ${T('static.title')}`), h('div', { class: 'pld-btn-grid' },
        btn('add.image', 'add-image', () => this.pickImage()),
        btn('add.text', 'add-text', () => this.addStatic(newText, 'text')),
        btn('add.line', 'add-line', () => this.addStatic(newLine, 'line')),
        btn('add.rect', 'add-rect', () => this.addStatic(newRect, 'rect')),
        btn('add.address', 'add-address', () => this.addStatic(newAddress, 'address')),
      )),
      h('div', null, h('div', { class: 'pld-section-title' }, `${T('add.title')} · ${T('flow.title')}`), h('div', { class: 'pld-btn-grid' },
        btn('add.flowText', 'add-flow-text', () => this.addFlow('text')),
        btn('add.table', 'add-table', () => this.addFlow('table')),
        btn('add.totals', 'add-totals', () => this.addFlow('totals')),
        btn('add.dynamicSections', 'add-dynamic', () => this.addFlow('dynamicSections')),
        btn('add.pageBreak', 'add-pagebreak', () => this.addFlow('pageBreak')),
      )),
      h('div', null, h('div', { class: 'pld-section-title' }, T('flow.title')), this.flowList),
      h('div', null, h('div', { class: 'pld-section-title' }, T('static.title')), this.staticList),
    )
  }

  private buildToolbar(readout: HTMLElement): HTMLElement {
    const T = this.t
    const mk = (text: string, label: string, testId: string, run: () => void) => h('button', { type: 'button', class: 'pld-btn pld-btn-sm', title: label, 'aria-label': label, 'data-testid': testId, onClick: run }, text)
    return h(
      'div',
      { class: 'pld-toolbar', 'data-testid': 'toolbar' },
      mk(T('view.first'), T('view.first'), 'view-first', () => this.store.setView('first')),
      mk(T('view.follow'), T('view.follow'), 'view-follow', () => this.store.setView('follow')),
      h('span', { class: 'pld-spacer' }),
      mk('−', T('toolbar.zoomOut'), 'zoom-out', () => this.store.setZoom(this.store.zoom - 0.25)),
      this.zoomLabel,
      mk('+', T('toolbar.zoomIn'), 'zoom-in', () => this.store.setZoom(this.store.zoom + 0.25)),
      mk(T('toolbar.fit'), T('toolbar.fit'), 'zoom-fit', () => this.store.setZoom(this.canvas.fitZoom())),
      mk(T('toolbar.grid'), T('toolbar.grid'), 'toggle-grid', () => this.store.setGrid({ showGrid: !this.store.showGrid })),
      mk(T('toolbar.snap'), T('toolbar.snap'), 'toggle-snap', () => this.store.setGrid({ snap: !this.store.snap })),
      readout,
    )
  }

  private syncToolbar(): void {
    const set = (testId: string, pressed: boolean) => this.root.querySelector(`[data-testid="${testId}"]`)?.setAttribute('aria-pressed', String(pressed))
    set('view-first', this.store.view === 'first')
    set('view-follow', this.store.view === 'follow')
    set('toggle-grid', this.store.showGrid)
    set('toggle-snap', this.store.snap)
  }

  private buildRight(): HTMLElement {
    const T = this.t
    const tabBar = h('div', { class: 'pld-tabs', role: 'tablist' })
    const entries: [Tab, MessageKey][] = [['properties', 'tab.properties'], ['page', 'tab.page'], ['preview', 'tab.preview']]
    for (const [tab, key] of entries) {
      const el = h('button', { type: 'button', class: 'pld-tab', role: 'tab', 'data-testid': `tab-${tab}`, onClick: () => this.setTab(tab) }, T(key))
      this.tabs[tab] = el
      tabBar.append(el)
    }
    return h('div', { class: 'pld-right', 'data-testid': 'right' }, tabBar, this.inspector.propsEl, this.inspector.pageEl, this.preview.element)
  }

  private setTab(tab: Tab): void {
    for (const key of Object.keys(this.tabs) as Tab[]) {
      this.tabs[key].setAttribute('aria-selected', String(key === tab))
      this.panels[key].hidden = key !== tab
    }
    this.preview.active = tab === 'preview'
    if (tab === 'preview') void this.preview.refresh()
  }

  private renderLists(): void {
    const sel = this.store.selection
    const T = this.t
    clear(this.flowList)
    this.store.layout.flow.forEach((block, index) => {
      const item = h(
        'div',
        { class: `pld-list-item${sel.kind === 'flow' && sel.index === index ? ' is-selected' : ''}`, draggable: true, 'data-testid': `flow-item-${index}`, 'data-index': index },
        h('span', { class: 'pld-grow' }, `${index + 1}. ${this.canvas.flowCardLabel(block)}`),
      )
      item.addEventListener('click', () => this.store.select({ kind: 'flow', index }))
      item.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', String(index)))
      item.addEventListener('dragover', (e) => {
        e.preventDefault()
        item.classList.add('is-over')
      })
      item.addEventListener('dragleave', () => item.classList.remove('is-over'))
      item.addEventListener('drop', (e) => {
        e.preventDefault()
        item.classList.remove('is-over')
        const from = Number(e.dataTransfer?.getData('text/plain'))
        if (Number.isInteger(from)) moveFlow(this.store, from, index)
      })
      this.flowList.append(item)
    })
    clear(this.staticList)
    const typeKey = { image: 'element.image', text: 'element.text', line: 'element.line', rect: 'element.rect', address: 'element.address' } as const
    ;[...this.store.layout.static].reverse().forEach((el) => {
      const item = h('div', { class: `pld-list-item${sel.kind === 'static' && sel.id === el.id ? ' is-selected' : ''}`, 'data-testid': `layer-${el.id}` }, h('span', { class: 'pld-grow' }, `${T(typeKey[el.type])} · ${el.id}`))
      item.addEventListener('click', () => this.store.select({ kind: 'static', id: el.id }))
      this.staticList.append(item)
    })
  }

  private renderWarnings(): void {
    const warnings = this.getWarnings()
    clear(this.warningsEl)
    this.warningsEl.append(h('div', { class: 'pld-section-title' }, this.t('warnings.title')))
    if (!warnings.length) {
      this.warningsEl.append(h('span', { class: 'pld-muted', 'data-testid': 'warnings-none' }, this.t('warnings.none')))
      return
    }
    const list = h('ul')
    for (const w of warnings) list.append(h('li', { 'data-code': w.code }, `${this.t(`warning.${w.code}` as MessageKey)}: ${w.message}`))
    this.warningsEl.append(list)
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (isEditable(e.target)) return
    const step = e.shiftKey ? 10 : 1
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        deleteSelection(this.store)
        break
      case 'ArrowLeft':
        nudgeSelection(this.store, -step, 0)
        break
      case 'ArrowRight':
        nudgeSelection(this.store, step, 0)
        break
      case 'ArrowUp':
        nudgeSelection(this.store, 0, -step)
        break
      case 'ArrowDown':
        nudgeSelection(this.store, 0, step)
        break
      case 'd':
      case 'D':
        if (!(e.ctrlKey || e.metaKey)) return
        duplicateSelection(this.store)
        break
      default:
        return
    }
    e.preventDefault()
  }
}

