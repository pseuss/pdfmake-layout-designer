import { PAGE_SIZES_MM, type Column, type FlowBlock, type StaticElement } from '@pdf-layouter/core'
import type { FontRegistry } from '@pdf-layouter/core'
import { deleteSelection, duplicateSelection, moveFlow, moveLayer } from './actions'
import { clear, h, toHex6 } from './dom'
import type { Translator } from './i18n'
import { createPicker, insertAtCursor } from './picker'
import { RichTextEditor } from './richtext'
import type { Store } from './store'

type El<T extends StaticElement['type']> = Extract<StaticElement, { type: T }>
type Block<T extends FlowBlock['type']> = Extract<FlowBlock, { type: T }>

export interface InspectorDeps {
  store: Store
  t: Translator
  fonts: FontRegistry
  /** Opens the file dialog; `replaceAsset` swaps the bitmap of an existing image. */
  pickImage: (replaceAsset?: string) => void
}

const RULES = ['all', 'first', 'notFirst', 'last'] as const
const ALIGNS = ['left', 'center', 'right', 'justify'] as const
const FORMATS = ['text', 'number', 'number:2', 'currency', 'date'] as const

/** Property panels for the selection (`propsEl`) and for the page (`pageEl`). */
export class Inspector {
  readonly propsEl = h('div', { class: 'pld-panel', 'data-testid': 'panel-properties' })
  readonly pageEl = h('div', { class: 'pld-panel', 'data-testid': 'panel-page' })
  private rich: RichTextEditor | undefined
  private lastInput: HTMLTextAreaElement | HTMLInputElement | undefined

  constructor(private d: InspectorDeps) {
    this.render()
  }

  private get store(): Store {
    return this.d.store
  }
  private get t(): Translator {
    return this.d.t
  }

  render(): void {
    this.rich?.destroy()
    this.rich = undefined
    this.lastInput = undefined
    this.renderProperties()
    this.renderPage()
  }

  // ---- field helpers ------------------------------------------------------------------

  private field(label: string, control: HTMLElement, testId?: string, stacked = false): HTMLElement {
    const id = `pld-f-${Math.random().toString(36).slice(2, 8)}`
    control.id ||= id
    return h('div', { class: `pld-field${stacked ? ' is-stacked' : ''}`, 'data-testid': testId ? `field-${testId}` : undefined }, h('label', { for: control.id }, label), control)
  }

  private num(label: string, value: number, onChange: (v: number) => void, testId: string, o: { min?: number; step?: number } = {}): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'number', value: String(value), step: String(o.step ?? 0.5), min: o.min !== undefined ? String(o.min) : undefined, 'data-testid': testId })
    input.addEventListener('input', () => {
      const v = input.valueAsNumber
      if (Number.isFinite(v) && (o.min === undefined || v >= o.min)) onChange(v)
    })
    return this.field(label, input, testId)
  }

  private text(label: string, value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'text', value, 'data-testid': testId })
    input.addEventListener('input', () => onChange(input.value))
    input.addEventListener('focus', () => (this.lastInput = input))
    return this.field(label, input, testId)
  }

  private select(label: string, options: readonly (readonly [string, string])[], value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const select = h('select', { class: 'pld-select', 'data-testid': testId })
    for (const [v, text] of options) select.append(h('option', { value: v }, text))
    if (!options.some(([v]) => v === value)) select.append(h('option', { value }, value))
    select.value = value
    select.addEventListener('change', () => onChange(select.value))
    return this.field(label, select, testId)
  }

  private color(label: string, value: string | undefined, onChange: (v: string | undefined) => void, testId: string, allowNone = false): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'color', value: toHex6(value), 'data-testid': testId })
    input.addEventListener('input', () => onChange(input.value))
    const row = h('div', { class: 'pld-row' }, input)
    if (allowNone) {
      row.append(h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': `${testId}-none`, onClick: () => onChange(undefined) }, this.t('prop.noFill')))
    }
    return this.field(label, row, testId)
  }

  private check(label: string, value: boolean, onChange: (v: boolean) => void, testId: string): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'checkbox', checked: value, 'data-testid': testId })
    input.addEventListener('change', () => onChange(input.checked))
    return this.field(label, input, testId)
  }

  private fontOptions(current: string | undefined): [string, string][] {
    const names = ['Roboto', ...this.d.fonts.map((f) => f.family).filter((f) => f !== 'Roboto')]
    if (current && !names.includes(current)) names.push(current)
    return names.map((n) => [n, n])
  }

  private textarea(label: string, value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const area = h('textarea', { class: 'pld-textarea', value, 'data-testid': testId })
    area.addEventListener('input', () => onChange(area.value))
    area.addEventListener('focus', () => (this.lastInput = area))
    this.lastInput = area
    const picker = createPicker(this.store.catalog, this.t, (token) => insertAtCursor(area, token), `${testId}-picker`)
    return h('div', { class: 'pld-group' }, this.field(label, area, testId, true), picker)
  }

  private editStatic<T extends StaticElement['type']>(id: string, fn: (el: El<T>) => void): void {
    this.store.update((d) => {
      const el = d.static.find((e) => e.id === id)
      if (el) fn(el as El<T>)
    }, 'panel')
  }

  private editFlow<T extends FlowBlock['type']>(index: number, fn: (b: Block<T>) => void, rerender = false): void {
    this.store.update((d) => {
      const b = d.flow[index]
      if (b) fn(b as Block<T>)
    }, rerender ? 'panel-structure' : 'panel')
  }

  private actions(extra: HTMLElement[] = []): HTMLElement {
    const sel = this.store.selection
    const row = h('div', { class: 'pld-row', 'data-testid': 'actions' })
    const btn = (label: string, testId: string, run: () => void, danger = false) => h('button', { type: 'button', class: `pld-btn pld-btn-sm${danger ? ' is-danger' : ''}`, 'data-testid': testId, onClick: run }, label)
    row.append(btn(this.t('action.duplicate'), 'action-duplicate', () => duplicateSelection(this.store)))
    if (sel.kind === 'static') {
      row.append(btn('↑', 'action-up', () => moveLayer(this.store, sel.id, 1)), btn('↓', 'action-down', () => moveLayer(this.store, sel.id, -1)))
    } else if (sel.kind === 'flow') {
      row.append(btn('↑', 'action-up', () => moveFlow(this.store, sel.index, sel.index - 1)), btn('↓', 'action-down', () => moveFlow(this.store, sel.index, sel.index + 1)))
    }
    row.append(...extra, btn(this.t('action.delete'), 'action-delete', () => deleteSelection(this.store), true))
    return row
  }

  // ---- properties ---------------------------------------------------------------------------

  private renderProperties(): void {
    clear(this.propsEl)
    const sel = this.store.selection
    if (sel.kind === 'none') {
      this.propsEl.append(h('p', { class: 'pld-muted' }, this.t('empty.selection')))
    } else if (sel.kind === 'static') {
      const el = this.store.layout.static.find((e) => e.id === sel.id)
      if (el) this.renderStatic(el)
    } else if (sel.kind === 'flow') {
      const block = this.store.layout.flow[sel.index]
      if (block) this.renderFlow(block, sel.index)
    } else {
      this.renderContentBox()
    }
  }

  private renderContentBox(): void {
    const view = this.store.view
    const box = this.store.layout.page.contentBox[view]
    const set = (k: keyof typeof box) => (v: number) =>
      this.store.update((d) => {
        d.page.contentBox[view][k] = v
      }, 'panel')
    this.propsEl.append(
      h('strong', null, `${this.t('contentBox')} · ${this.t(view === 'first' ? 'view.first' : 'view.follow')}`),
      this.num(this.t('prop.top'), box.top, set('top'), 'cbox-top', { min: 0 }),
      this.num(this.t('prop.bottom'), box.bottom, set('bottom'), 'cbox-bottom', { min: 0 }),
      this.num(this.t('prop.left'), box.left, set('left'), 'cbox-left', { min: 0 }),
      this.num(this.t('prop.right'), box.right, set('right'), 'cbox-right', { min: 0 }),
    )
  }

  private renderStatic(el: StaticElement): void {
    const id = el.id
    const T = this.t
    const rule = this.select(T('prop.pages'), RULES.map((r) => [r, T(`rule.${r}` as const)] as const), el.pages, (v) => this.editStatic(id, (e) => void (e.pages = v as (typeof RULES)[number])), 'pages')
    const typeLabels = { image: 'element.image', text: 'element.text', line: 'element.line', rect: 'element.rect', address: 'element.address' } as const
    this.propsEl.append(h('strong', { 'data-testid': 'panel-title' }, `${T(typeLabels[el.type])} · ${el.id}`), this.actions())

    const pos = (e: El<'image'> | El<'rect'> | El<'text'>, withH: boolean) => {
      const f = [
        this.num(T('prop.x'), e.x, (v) => this.editStatic<'image'>(id, (t) => void (t.x = v)), 'x'),
        this.num(T('prop.y'), e.y, (v) => this.editStatic<'image'>(id, (t) => void (t.y = v)), 'y'),
        this.num(T('prop.w'), e.w, (v) => this.editStatic<'image'>(id, (t) => void (t.w = v)), 'w', { min: 1 }),
      ]
      if (withH && 'h' in e) f.push(this.num(T('prop.h'), (e as El<'image'>).h, (v) => this.editStatic<'image'>(id, (t) => void (t.h = v)), 'h', { min: 1 }))
      return f
    }
    const textProps = (e: El<'text'> | El<'address'>) => [
      this.select(T('prop.font'), this.fontOptions(e.font), e.font ?? 'Roboto', (v) => this.editStatic<'text'>(id, (t) => void (t.font = v)), 'font'),
      this.num(T('prop.size'), e.size ?? 10, (v) => this.editStatic<'text'>(id, (t) => void (t.size = v)), 'size', { min: 1, step: 0.5 }),
      this.color(T('prop.color'), e.color, (v) => this.editStatic<'text'>(id, (t) => void (t.color = v)), 'color'),
      this.check(T('prop.bold'), e.bold ?? false, (v) => this.editStatic<'text'>(id, (t) => void (t.bold = v)), 'bold'),
      this.check(T('prop.italic'), e.italic ?? false, (v) => this.editStatic<'text'>(id, (t) => void (t.italic = v)), 'italic'),
      this.select(T('prop.align'), ALIGNS.map((a) => [a, T(`align.${a}` as const)] as const), e.align, (v) => this.editStatic<'text'>(id, (t) => void (t.align = v as El<'text'>['align'])), 'align'),
    ]

    switch (el.type) {
      case 'image': {
        const asset = this.store.layout.assets[el.asset]
        this.propsEl.append(
          rule,
          ...pos(el, true),
          h('div', { class: 'pld-row' }, h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': 'replace-image', onClick: () => this.d.pickImage(el.asset) }, T('prop.asset')), asset ? h('span', { class: 'pld-muted' }, `${asset.w ?? '?'}×${asset.h ?? '?'} px`) : null),
        )
        break
      }
      case 'rect':
        this.propsEl.append(
          rule,
          ...pos(el, true),
          this.color(T('prop.fill'), el.fill, (v) => this.editStatic<'rect'>(id, (t) => void (t.fill = v)), 'fill', true),
          this.color(T('prop.stroke'), el.stroke?.color, (v) => this.editStatic<'rect'>(id, (t) => void (t.stroke = v ? { color: v, width: t.stroke?.width ?? 0.5 } : undefined)), 'stroke', true),
          this.num(T('prop.strokeWidth'), el.stroke?.width ?? 0.5, (v) => this.editStatic<'rect'>(id, (t) => void (t.stroke = { color: t.stroke?.color ?? '#000000', width: v })), 'stroke-width', { min: 0, step: 0.25 }),
          this.num(T('prop.radius'), el.radius, (v) => this.editStatic<'rect'>(id, (t) => void (t.radius = v)), 'radius', { min: 0 }),
        )
        break
      case 'line':
        this.propsEl.append(
          rule,
          this.num(T('prop.x1'), el.x1, (v) => this.editStatic<'line'>(id, (t) => void (t.x1 = v)), 'x1'),
          this.num(T('prop.y1'), el.y1, (v) => this.editStatic<'line'>(id, (t) => void (t.y1 = v)), 'y1'),
          this.num(T('prop.x2'), el.x2, (v) => this.editStatic<'line'>(id, (t) => void (t.x2 = v)), 'x2'),
          this.num(T('prop.y2'), el.y2, (v) => this.editStatic<'line'>(id, (t) => void (t.y2 = v)), 'y2'),
          this.num(T('prop.width'), el.width, (v) => this.editStatic<'line'>(id, (t) => void (t.width = v)), 'line-width', { min: 0.1, step: 0.25 }),
          this.color(T('prop.color'), el.color, (v) => this.editStatic<'line'>(id, (t) => void (t.color = v ?? '#000000')), 'color'),
          this.select(T('prop.dash'), (['solid', 'dashed', 'dotted'] as const).map((d) => [d, T(`dash.${d}` as const)] as const), el.dash, (v) => this.editStatic<'line'>(id, (t) => void (t.dash = v as El<'line'>['dash'])), 'dash'),
        )
        break
      case 'text':
        this.propsEl.append(rule, ...pos(el, false), this.textarea(T('prop.content'), el.content, (v) => this.editStatic<'text'>(id, (t) => void (t.content = v)), 'content'), ...textProps(el))
        break
      case 'address':
        this.propsEl.append(
          rule,
          this.select(T('prop.preset'), [['DIN5008-A', 'DIN 5008 Form A'], ['DIN5008-B', 'DIN 5008 Form B']], el.preset, (v) => this.editStatic<'address'>(id, (t) => void (t.preset = v as El<'address'>['preset'])), 'preset'),
          this.textarea(T('prop.content'), el.content, (v) => this.editStatic<'address'>(id, (t) => void (t.content = v)), 'content'),
          this.text(T('prop.returnAddress'), el.returnAddress ?? '', (v) => this.editStatic<'address'>(id, (t) => void (t.returnAddress = v || undefined)), 'return-address'),
          ...textProps(el),
        )
        break
    }
  }

  // ---- flow blocks ----------------------------------------------------------------------------

  private renderFlow(block: FlowBlock, index: number): void {
    const T = this.t
    const labels = { text: 'flow.text', table: 'flow.table', totals: 'flow.totals', dynamicSections: 'flow.dynamicSections', pageBreak: 'flow.pageBreak' } as const
    this.propsEl.append(h('strong', { 'data-testid': 'panel-title' }, `${T(labels[block.type])} · #${index + 1}`), this.actions())

    switch (block.type) {
      case 'text': {
        const editor = new RichTextEditor(block.content, T, (blocks) => this.editFlow<'text'>(index, (b) => void (b.content = blocks)))
        this.rich = editor
        this.propsEl.append(editor.element, createPicker(this.store.catalog, T, (token) => editor.insertText(token), 'flow-picker'))
        break
      }
      case 'table':
        this.renderTable(block, index)
        break
      case 'totals':
        this.renderTotals(block, index)
        break
      case 'dynamicSections':
        this.propsEl.append(
          this.text(T('prop.source'), block.source, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.source = v)), 'source'),
          this.color(T('prop.headerFill'), block.styles.table.headerFill, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.table.headerFill = v)), 'header-fill', true),
          this.check(T('prop.zebra'), block.styles.table.zebra, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.table.zebra = v)), 'zebra'),
          this.num(T('prop.margin'), block.styles.text.margin[1], (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.text.margin = [0, v, 0, v])), 'text-margin', { min: 0, step: 1 }),
        )
        break
      case 'pageBreak':
        break
    }
  }

  private renderTable(block: Block<'table'>, index: number): void {
    const T = this.t
    const lists = this.store.catalog?.lists ?? []
    const list = lists.find((l) => l.key === block.source)
    const structural = (fn: (b: Block<'table'>) => void) => {
      this.editFlow<'table'>(index, fn, true)
      this.render()
    }

    this.propsEl.append(
      lists.length
        ? this.select(T('prop.source'), lists.map((l) => [l.key, l.label] as const), block.source, (v) => structural((b) => void (b.source = v)), 'source')
        : this.text(T('prop.source'), block.source, (v) => this.editFlow<'table'>(index, (b) => void (b.source = v)), 'source'),
    )

    const columns = h('div', { class: 'pld-list', 'data-testid': 'columns' })
    block.columns.forEach((c, i) => {
      const edit = (fn: (col: Column) => void, rerender = false) => {
        const apply = (b: Block<'table'>) => fn(b.columns[i]!)
        rerender ? structural(apply) : this.editFlow<'table'>(index, apply)
      }
      const fieldControl = list
        ? this.select(T('prop.field'), list.fields.map((f) => [f.key, f.label] as const), c.field, (v) => edit((col) => void (col.field = v), true), `col-${i}-field`)
        : this.text(T('prop.field'), c.field, (v) => edit((col) => void (col.field = v)), `col-${i}-field`)
      columns.append(
        h(
          'div',
          { class: 'pld-group', 'data-testid': `column-${i}` },
          fieldControl,
          this.text(T('prop.title'), c.title, (v) => edit((col) => void (col.title = v)), `col-${i}-title`),
          this.text(T('prop.w'), String(c.width), (v) => {
            const n = Number(v)
            edit((col) => void (col.width = v === '*' || v === 'auto' ? v : Number.isFinite(n) && n > 0 ? n : col.width))
          }, `col-${i}-width`),
          this.select(T('prop.align'), (['left', 'center', 'right'] as const).map((a) => [a, T(`align.${a}` as const)] as const), c.align, (v) => edit((col) => void (col.align = v as Column['align'])), `col-${i}-align`),
          this.select(T('prop.format'), FORMATS.map((f) => [f, T(`format.${f.split(':')[0] as 'text'}` as const) + (f.includes(':') ? ` (${f.split(':')[1]})` : '')] as const), c.format, (v) => edit((col) => void (col.format = v)), `col-${i}-format`),
          h(
            'div',
            { class: 'pld-row' },
            h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': `col-${i}-up`, onClick: () => structural((b) => void ([b.columns[i - 1], b.columns[i]] = [b.columns[i]!, b.columns[i - 1]!])), disabled: i === 0 }, '←'),
            h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': `col-${i}-down`, onClick: () => structural((b) => void ([b.columns[i], b.columns[i + 1]] = [b.columns[i + 1]!, b.columns[i]!])), disabled: i === block.columns.length - 1 }, '→'),
            h('button', { type: 'button', class: 'pld-btn pld-btn-sm is-danger', 'data-testid': `col-${i}-remove`, onClick: () => structural((b) => void b.columns.splice(i, 1)), disabled: block.columns.length === 1 }, T('action.remove')),
          ),
        ),
      )
    })
    this.propsEl.append(
      h('div', { class: 'pld-section-title' }, T('prop.columns')),
      columns,
      h('button', {
        type: 'button',
        class: 'pld-btn',
        'data-testid': 'add-column',
        onClick: () =>
          structural((b) => {
            const unused = list?.fields.find((f) => !b.columns.some((c) => c.field === f.key))
            const numeric = unused?.type === 'number' || unused?.type === 'currency'
            b.columns.push({ field: unused?.key ?? 'feld', title: unused?.label ?? 'Feld', width: numeric ? 28 : '*', align: numeric ? 'right' : 'left', format: unused?.type && unused.type !== 'text' ? unused.type : 'text' })
          }),
      }, T('action.addColumn')),
      this.color(T('prop.headerFill'), block.style.headerFill, (v) => this.editFlow<'table'>(index, (b) => void (b.style.headerFill = v)), 'header-fill', true),
      this.check(T('prop.zebra'), block.style.zebra, (v) => this.editFlow<'table'>(index, (b) => void (b.style.zebra = v)), 'zebra'),
      this.select(T('prop.borders'), (['none', 'horizontal', 'grid'] as const).map((b) => [b, T(`borders.${b}` as const)] as const), block.style.borders, (v) => this.editFlow<'table'>(index, (b) => void (b.style.borders = v as Block<'table'>['style']['borders'])), 'borders'),
    )
  }

  private renderTotals(block: Block<'totals'>, index: number): void {
    const T = this.t
    const structural = (fn: (b: Block<'totals'>) => void) => {
      this.editFlow<'totals'>(index, fn, true)
      this.render()
    }
    const rows = h('div', { class: 'pld-list', 'data-testid': 'totals-rows' })
    block.rows.forEach((r, i) => {
      rows.append(
        h(
          'div',
          { class: 'pld-group', 'data-testid': `totals-row-${i}` },
          this.text(T('prop.label'), r.label, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.label = v)), `row-${i}-label`),
          this.text(T('prop.value'), r.value, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.value = v)), `row-${i}-value`),
          this.check(T('prop.bold'), r.bold, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.bold = v)), `row-${i}-bold`),
          h('button', { type: 'button', class: 'pld-btn pld-btn-sm is-danger', 'data-testid': `row-${i}-remove`, disabled: block.rows.length === 1, onClick: () => structural((b) => void b.rows.splice(i, 1)) }, T('action.remove')),
        ),
      )
    })
    this.propsEl.append(
      this.num(T('prop.w'), block.width, (v) => this.editFlow<'totals'>(index, (b) => void (b.width = v)), 'totals-width', { min: 20 }),
      this.select(T('prop.align'), [['left', T('align.left')], ['right', T('align.right')]], block.align, (v) => this.editFlow<'totals'>(index, (b) => void (b.align = v as 'left' | 'right')), 'totals-align'),
      h('div', { class: 'pld-section-title' }, T('prop.rows')),
      rows,
      h('button', { type: 'button', class: 'pld-btn', 'data-testid': 'add-row', onClick: () => structural((b) => void b.rows.push({ label: '', value: '', bold: false })) }, T('action.addRow')),
      createPicker(this.store.catalog, T, (token) => this.lastInput && insertAtCursor(this.lastInput, token), 'totals-picker'),
    )
  }

  // ---- page ----------------------------------------------------------------------------------------

  private renderPage(): void {
    clear(this.pageEl)
    const T = this.t
    const { layout } = this.store
    const set = (fn: (d: typeof layout) => void) => this.store.update(fn, 'panel')
    const box = (key: 'first' | 'follow') =>
      (['top', 'bottom', 'left', 'right'] as const).map((side) => this.num(T(`prop.${side}` as const), layout.page.contentBox[key][side], (v) => set((d) => void (d.page.contentBox[key][side] = v)), `page-${key}-${side}`, { min: 0 }))
    this.pageEl.append(
      this.select(T('page.size'), Object.keys(PAGE_SIZES_MM).map((s) => [s, s] as const), layout.page.size, (v) => set((d) => void (d.page.size = v as typeof layout.page.size)), 'page-size'),
      this.select(T('page.orientation'), [['portrait', T('page.portrait')], ['landscape', T('page.landscape')]], layout.page.orientation, (v) => set((d) => void (d.page.orientation = v as 'portrait' | 'landscape')), 'page-orientation'),
      this.text(T('page.locale'), layout.locale, (v) => set((d) => void (d.locale = v)), 'locale'),
      this.text(T('page.currency'), layout.currency, (v) => v.length === 3 && set((d) => void (d.currency = v.toUpperCase())), 'currency'),
      this.select(T('page.defaultFont'), this.fontOptions(layout.page.defaults.font), layout.page.defaults.font, (v) => set((d) => void (d.page.defaults.font = v)), 'default-font'),
      this.num(T('page.defaultSize'), layout.page.defaults.size, (v) => set((d) => void (d.page.defaults.size = v)), 'default-size', { min: 1 }),
      this.color(T('page.defaultColor'), layout.page.defaults.color, (v) => set((d) => void (d.page.defaults.color = v ?? '#222222')), 'default-color'),
      h('div', { class: 'pld-section-title' }, T('page.firstBox')),
      ...box('first'),
      h('div', { class: 'pld-section-title' }, T('page.followBox')),
      ...box('follow'),
      h('div', { class: 'pld-section-title' }, T('page.footer')),
      this.text(T('page.footer'), layout.page.footer?.content ?? '', (v) => set((d) => void (d.page.footer = v ? { content: v, align: d.page.footer?.align ?? 'right', size: d.page.footer?.size ?? 8 } : undefined)), 'footer'),
      this.select(T('page.footerAlign'), (['left', 'center', 'right'] as const).map((a) => [a, T(`align.${a}` as const)] as const), layout.page.footer?.align ?? 'right', (v) => set((d) => void (d.page.footer && (d.page.footer.align = v as 'left' | 'center' | 'right'))), 'footer-align'),
    )
  }
}
