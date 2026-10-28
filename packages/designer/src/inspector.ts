import { PAGE_SIZES_MM, totalsRowLine, type Column, type Condition, type FlowBlock, type LeafCondition, type StaticElement } from '@pdf-layouter/core'
import type { FontRegistry } from '@pdf-layouter/core'
import { Fields } from './fields'
import { FLOW_LABEL_KEYS } from './flowcards'
import { alignSelection, deleteSelection, duplicateSelection, moveFlow, moveLayer } from './actions'
import type { Align } from './geometry'
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
  private readonly fields: Fields

  constructor(private d: InspectorDeps) {
    this.fields = new Fields(d.t, (input) => (this.lastInput = input))
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

  // ---- field helpers: see fields.ts ------------------------------------------------------

  private fontOptions(current: string | undefined): [string, string][] {
    const names = ['Roboto', ...this.d.fonts.map((f) => f.family).filter((f) => f !== 'Roboto')]
    if (current && !names.includes(current)) names.push(current)
    return names.map((n) => [n, n])
  }

  /** Font select whose first entry means "inherit the document font". */
  private fontField(current: string | undefined, onChange: (v: string | undefined) => void, testId = 'font'): HTMLElement {
    const doc = this.store.layout.page.defaults.font
    const options: [string, string][] = [['', this.t('prop.fontInherit', { font: doc })], ...this.fontOptions(current)]
    return this.fields.select(this.t('prop.font'), options, current ?? '', (v) => onChange(v || undefined), testId)
  }

  /**
   * `visibleWhen` expression builder: comparisons combined with "all of" (AND), "any of" (OR) and "not", nested as deep as needed.
   * Edits go to one mutable copy and are emitted as a fresh clone, so inputs that stay alive while typing never edit stale data.
   */
  private conditionFields(cond: Condition | undefined, onChange: (c: Condition | undefined) => void, rerender: () => void): HTMLElement {
    const T = this.t
    let root: Condition | undefined = cond ? structuredClone(cond) : undefined
    const commit = () => onChange(root ? structuredClone(root) : undefined)
    const structural = () => {
      commit()
      rerender()
    }
    const first = this.store.catalog?.groups[0]
    const defaultPath = first?.fields[0] ? `${first.key}.${first.fields[0].key}` : 'feld'
    const newLeaf = (): Condition => ({ path: defaultPath, op: 'exists' })
    const listId = `pld-paths-${Math.random().toString(36).slice(2, 8)}`
    const OPS: [LeafCondition['op'], string][] = [['exists', T('cond.exists')], ['empty', T('cond.empty')], ['equals', T('cond.equals')], ['notEquals', T('cond.notEquals')], ['gt', T('cond.gt')], ['gte', T('cond.gte')], ['lt', T('cond.lt')], ['lte', T('cond.lte')]]
    const group = h('div', { class: 'pld-group', 'data-testid': 'visible-when' })
    group.append(h('div', { class: 'pld-section-title' }, T('prop.visibleWhen')))

    const button = (label: string, testId: string, run: () => void, danger = false) =>
      h('button', { type: 'button', class: `pld-btn pld-btn-sm${danger ? ' is-danger' : ''}`, 'data-testid': testId, onClick: run }, label)

    /** Renders one node; `set` replaces it in its parent, `remove` deletes it from there. */
    const renderNode = (node: Condition, set: (n: Condition) => void, remove: () => void, depth: number, id: string): HTMLElement => {
      let negate = false
      let inner = node
      while ('not' in inner) {
        negate = !negate
        inner = inner.not
      }
      const wrap = (n: Condition): Condition => (negate ? { not: n } : n)
      const negateBox = h('input', { type: 'checkbox', checked: negate, title: T('cond.not'), 'aria-label': T('cond.not'), 'data-testid': `${id}-not` })
      negateBox.addEventListener('change', () => {
        set(negateBox.checked ? { not: inner } : inner)
        structural()
      })
      const notLabel = h('label', { class: 'pld-check' }, negateBox, T('cond.not'))
      const wrapper = h('div', { class: 'pld-group', 'data-testid': id, style: { marginLeft: depth ? '8px' : '0' } })

      if ('all' in inner || 'any' in inner) {
        const kind = 'all' in inner ? 'all' : 'any'
        const children = 'all' in inner ? inner.all : inner.any
        const kindSelect = h('select', { class: 'pld-select', 'data-testid': `${id}-kind` }, h('option', { value: 'all' }, T('cond.all')), h('option', { value: 'any' }, T('cond.any')))
        kindSelect.value = kind
        kindSelect.addEventListener('change', () => {
          set(wrap(kindSelect.value === 'all' ? { all: children } : { any: children }))
          structural()
        })
        wrapper.append(h('div', { class: 'pld-row' }, kindSelect, notLabel, button('×', `${id}-remove`, remove, true)))
        children.forEach((child, i) =>
          wrapper.append(
            renderNode(
              child,
              (n) => void (children[i] = n),
              () => {
                children.splice(i, 1)
                if (children.length === 0) remove()
                else structural()
              },
              depth + 1,
              `${id}-${i}`,
            ),
          ),
        )
        wrapper.append(
          h('div', { class: 'pld-row' },
            button(T('cond.add'), `${id}-add`, () => {
              children.push(newLeaf())
              structural()
            }),
            button(T('cond.addGroup'), `${id}-add-group`, () => {
              children.push({ any: [newLeaf()] })
              structural()
            }),
          ),
        )
        return wrapper
      }

      const leaf = inner as LeafCondition
      const path = h('input', { class: 'pld-input', value: leaf.path, list: listId, placeholder: 'kunde.name', 'aria-label': T('prop.condPath'), 'data-testid': `${id}-path` })
      path.addEventListener('input', () => {
        if (!path.value.trim()) return
        leaf.path = path.value.trim()
        commit()
      })
      const op = h('select', { class: 'pld-select', 'aria-label': T('prop.visibleWhen'), 'data-testid': `${id}-op` })
      for (const [v, label] of OPS) op.append(h('option', { value: v }, label))
      op.value = leaf.op
      op.addEventListener('change', () => {
        leaf.op = op.value as LeafCondition['op']
        structural()
      })
      wrapper.append(h('div', { class: 'pld-row' }, path, button('×', `${id}-remove`, remove, true)), h('div', { class: 'pld-row' }, op, notLabel))
      if (!['exists', 'empty'].includes(leaf.op)) {
        const value = h('input', { class: 'pld-input', value: leaf.value === undefined ? '' : String(leaf.value), placeholder: T('prop.condValue'), 'aria-label': T('prop.condValue'), 'data-testid': `${id}-value` })
        value.addEventListener('input', () => {
          leaf.value = value.value
          commit()
        })
        wrapper.append(value)
      }
      return wrapper
    }

    const body = h('div', { class: 'pld-list' })
    group.append(
      body,
      h('datalist', { id: listId }, ...(this.store.catalog?.groups ?? []).flatMap((g) => g.fields.map((f) => h('option', { value: `${g.key}.${f.key}` })))),
    )
    if (!root) {
      group.append(h('span', { class: 'pld-muted', 'data-testid': 'cond-always' }, T('cond.always')), button(T('cond.add'), 'cond-add', () => {
        root = newLeaf()
        structural()
      }))
    } else {
      body.append(
        renderNode(
          root,
          (n) => void (root = n),
          () => {
            root = undefined
            structural()
          },
          0,
          'cond',
        ),
      )
      if (!('all' in root) && !('any' in root)) {
        // a single comparison can grow into a group without losing what was entered
        group.append(button(T('cond.addCondition'), 'cond-more', () => {
          root = { all: [root!, newLeaf()] }
          structural()
        }))
      }
    }
    return group
  }

  private textarea(label: string, value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const area = h('textarea', { class: 'pld-textarea', value, 'data-testid': testId })
    area.addEventListener('input', () => onChange(area.value))
    area.addEventListener('focus', () => (this.lastInput = area))
    this.lastInput = area
    const picker = createPicker(this.store.catalog, this.t, (token) => insertAtCursor(area, token), `${testId}-picker`, { pageVars: true })
    return h('div', { class: 'pld-group' }, this.fields.field(label, area, testId, true), picker)
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
    } else if (sel.kind === 'multi') {
      this.renderMulti(sel.ids.length)
    } else {
      this.renderContentBox()
    }
  }

  private renderMulti(count: number): void {
    const aligns: [Align, string][] = [['left', '⇤'], ['center', '↔'], ['right', '⇥'], ['top', '⤒'], ['middle', '↕'], ['bottom', '⤓']]
    this.propsEl.append(
      h('strong', { 'data-testid': 'panel-title' }, this.t('multi.title', { n: count })),
      this.actions(),
      h('div', { class: 'pld-section-title' }, this.t('multi.align')),
      h('div', { class: 'pld-row', 'data-testid': 'align-row' }, ...aligns.map(([a, symbol]) => h('button', { type: 'button', class: 'pld-btn pld-btn-sm', title: this.t(`align.${a}` as 'align.left'), 'aria-label': this.t(`align.${a}` as 'align.left'), 'data-testid': `align-${a}`, onClick: () => alignSelection(this.store, a) }, symbol))),
    )
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
      this.fields.num(this.t('prop.top'), box.top, set('top'), 'cbox-top', { min: 0 }),
      this.fields.num(this.t('prop.bottom'), box.bottom, set('bottom'), 'cbox-bottom', { min: 0 }),
      this.fields.num(this.t('prop.left'), box.left, set('left'), 'cbox-left', { min: 0 }),
      this.fields.num(this.t('prop.right'), box.right, set('right'), 'cbox-right', { min: 0 }),
    )
  }

  private renderStatic(el: StaticElement): void {
    const id = el.id
    const T = this.t
    const rule = this.fields.select(T('prop.pages'), RULES.map((r) => [r, T(`rule.${r}` as const)] as const), el.pages, (v) => this.editStatic(id, (e) => void (e.pages = v as (typeof RULES)[number])), 'pages')
    const typeLabels = { image: 'element.image', text: 'element.text', line: 'element.line', rect: 'element.rect', address: 'element.address' } as const
    this.propsEl.append(h('strong', { 'data-testid': 'panel-title' }, `${T(typeLabels[el.type])} · ${el.id}`), this.actions())

    const pos = (e: El<'image'> | El<'rect'> | El<'text'>, withH: boolean) => {
      const f = [
        this.fields.num(T('prop.x'), e.x, (v) => this.editStatic<'image'>(id, (t) => void (t.x = v)), 'x'),
        this.fields.num(T('prop.y'), e.y, (v) => this.editStatic<'image'>(id, (t) => void (t.y = v)), 'y'),
        this.fields.num(T('prop.w'), e.w, (v) => this.editStatic<'image'>(id, (t) => void (t.w = v)), 'w', { min: 1 }),
      ]
      if (withH && 'h' in e) f.push(this.fields.num(T('prop.h'), (e as El<'image'>).h, (v) => this.editStatic<'image'>(id, (t) => void (t.h = v)), 'h', { min: 1 }))
      return f
    }
    const textProps = (e: El<'text'> | El<'address'>) => [
      this.fontField(e.font, (v) => this.editStatic<'text'>(id, (t) => void (t.font = v))),
      this.fields.num(T('prop.size'), e.size ?? 10, (v) => this.editStatic<'text'>(id, (t) => void (t.size = v)), 'size', { min: 1, step: 0.5 }),
      this.fields.color(T('prop.color'), e.color, (v) => this.editStatic<'text'>(id, (t) => void (t.color = v)), 'color'),
      this.fields.check(T('prop.bold'), e.bold ?? false, (v) => this.editStatic<'text'>(id, (t) => void (t.bold = v)), 'bold'),
      this.fields.check(T('prop.italic'), e.italic ?? false, (v) => this.editStatic<'text'>(id, (t) => void (t.italic = v)), 'italic'),
      this.fields.select(T('prop.align'), ALIGNS.map((a) => [a, T(`align.${a}` as const)] as const), e.align, (v) => this.editStatic<'text'>(id, (t) => void (t.align = v as El<'text'>['align'])), 'align'),
    ]

    // one panel per Static Element type
    const panels: { [K in StaticElement['type']]: (el: El<K>) => void } = {
      image: (el) => {
        const asset = this.store.layout.assets[el.asset]
        this.propsEl.append(
          rule,
          ...pos(el, true),
          h('div', { class: 'pld-row' }, h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': 'replace-image', onClick: () => this.d.pickImage(el.asset) }, T('prop.asset')), asset ? h('span', { class: 'pld-muted' }, `${asset.w ?? '?'}×${asset.h ?? '?'} px`) : null),
        )
      },
      rect: (el) => {
        this.propsEl.append(
          rule,
          ...pos(el, true),
          this.fields.color(T('prop.fill'), el.fill, (v) => this.editStatic<'rect'>(id, (t) => void (t.fill = v)), 'fill', true),
          this.fields.color(T('prop.stroke'), el.stroke?.color, (v) => this.editStatic<'rect'>(id, (t) => void (t.stroke = v ? { color: v, width: t.stroke?.width ?? 0.5 } : undefined)), 'stroke', true),
          this.fields.num(T('prop.strokeWidth'), el.stroke?.width ?? 0.5, (v) => this.editStatic<'rect'>(id, (t) => void (t.stroke = { color: t.stroke?.color ?? '#000000', width: v })), 'stroke-width', { min: 0, step: 0.25 }),
          this.fields.num(T('prop.radius'), el.radius, (v) => this.editStatic<'rect'>(id, (t) => void (t.radius = v)), 'radius', { min: 0 }),
        )
      },
      line: (el) => {
        this.propsEl.append(
          rule,
          this.fields.num(T('prop.x1'), el.x1, (v) => this.editStatic<'line'>(id, (t) => void (t.x1 = v)), 'x1'),
          this.fields.num(T('prop.y1'), el.y1, (v) => this.editStatic<'line'>(id, (t) => void (t.y1 = v)), 'y1'),
          this.fields.num(T('prop.x2'), el.x2, (v) => this.editStatic<'line'>(id, (t) => void (t.x2 = v)), 'x2'),
          this.fields.num(T('prop.y2'), el.y2, (v) => this.editStatic<'line'>(id, (t) => void (t.y2 = v)), 'y2'),
          this.fields.num(T('prop.width'), el.width, (v) => this.editStatic<'line'>(id, (t) => void (t.width = v)), 'line-width', { min: 0.1, step: 0.25 }),
          this.fields.color(T('prop.color'), el.color, (v) => this.editStatic<'line'>(id, (t) => void (t.color = v ?? '#000000')), 'color'),
          this.fields.select(T('prop.dash'), (['solid', 'dashed', 'dotted'] as const).map((d) => [d, T(`dash.${d}` as const)] as const), el.dash, (v) => this.editStatic<'line'>(id, (t) => void (t.dash = v as El<'line'>['dash'])), 'dash'),
        )
      },
      text: (el) => {
        this.propsEl.append(rule, ...pos(el, false), this.textarea(T('prop.content'), el.content, (v) => this.editStatic<'text'>(id, (t) => void (t.content = v)), 'content'), ...textProps(el))
      },
      address: (el) => {
        this.propsEl.append(
          rule,
          this.fields.select(T('prop.preset'), [['DIN5008-A', 'DIN 5008 Form A'], ['DIN5008-B', 'DIN 5008 Form B']], el.preset, (v) => this.editStatic<'address'>(id, (t) => void (t.preset = v as El<'address'>['preset'])), 'preset'),
          this.textarea(T('prop.content'), el.content, (v) => this.editStatic<'address'>(id, (t) => void (t.content = v)), 'content'),
          this.fields.text(T('prop.returnAddress'), el.returnAddress ?? '', (v) => this.editStatic<'address'>(id, (t) => void (t.returnAddress = v || undefined)), 'return-address'),
          ...textProps(el),
        )
      },
    }
    ;(panels[el.type] as (el: StaticElement) => void)(el)
    this.propsEl.append(
      this.conditionFields(
        el.visibleWhen,
        (c) => this.editStatic(id, (t) => void (t.visibleWhen = c)),
        () => this.render(),
      ),
    )
  }

  // ---- flow blocks ----------------------------------------------------------------------------

  private renderFlow(block: FlowBlock, index: number): void {
    const T = this.t
    this.propsEl.append(h('strong', { 'data-testid': 'panel-title' }, `${T(FLOW_LABEL_KEYS[block.type])} · #${index + 1}`), this.actions())

    if (block.type !== 'pageBreak') {
      this.propsEl.append(this.fontField(block.font, (v) => this.editFlow<'text'>(index, (b) => void (b.font = v))))
    }
    if (block.type === 'text' || block.type === 'table' || block.type === 'totals') {
      const prev = this.store.layout.flow[index - 1]
      const canJoin = !!prev && (prev.type === 'text' || prev.type === 'table' || prev.type === 'totals')
      const sameRow = this.fields.check(T('prop.sameRow'), !!block.sameRow && canJoin, (v) => {
        this.editFlow<'text'>(index, (b) => void (b.sameRow = v || undefined), true)
        this.render()
      }, 'same-row')
      sameRow.querySelector('input')?.toggleAttribute('disabled', !canJoin)
      this.propsEl.append(sameRow)
      if (block.type !== 'totals') {
        this.propsEl.append(
          this.fields.text(T('prop.rowWidth'), block.width === undefined ? '*' : String(block.width), (v) => {
            const n = Number(v.replace(',', '.'))
            this.editFlow<'text'>(index, (b) => void (b.width = v.trim() === '' || v.trim() === '*' ? undefined : Number.isFinite(n) && n > 0 ? n : b.width))
          }, 'block-width'),
        )
      }
    }
    // one panel per Flow Block type
    const panels: { [K in FlowBlock['type']]: (block: Block<K>) => void } = {
      text: (block) => {
        const editor = new RichTextEditor(block.content, T, (blocks) => this.editFlow<'text'>(index, (b) => void (b.content = blocks)))
        this.rich = editor
        this.propsEl.append(editor.element, createPicker(this.store.catalog, T, (token) => editor.insertText(token), 'flow-picker'))
      },
      table: (block) => this.renderTable(block, index),
      totals: (block) => this.renderTotals(block, index),
      dynamicSections: (block) => {
        this.propsEl.append(
          this.fields.text(T('prop.source'), block.source, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.source = v)), 'source'),
          this.fields.color(T('prop.headerFill'), block.styles.table.headerFill, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.table.headerFill = v)), 'header-fill', true),
          this.fields.check(T('prop.zebra'), block.styles.table.zebra, (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.table.zebra = v)), 'zebra'),
          this.fields.num(T('prop.margin'), block.styles.text.margin[1], (v) => this.editFlow<'dynamicSections'>(index, (b) => void (b.styles.text.margin = [0, v, 0, v])), 'text-margin', { min: 0, step: 1 }),
        )
      },
      pageBreak: () => {},
    }
    ;(panels[block.type] as (block: FlowBlock) => void)(block)
    this.propsEl.append(
      this.conditionFields(
        block.visibleWhen,
        (c) => this.editFlow<'text'>(index, (b) => void (b.visibleWhen = c)),
        () => this.render(),
      ),
    )
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
        ? this.fields.select(T('prop.source'), lists.map((l) => [l.key, l.label] as const), block.source, (v) => structural((b) => void (b.source = v)), 'source')
        : this.fields.text(T('prop.source'), block.source, (v) => this.editFlow<'table'>(index, (b) => void (b.source = v)), 'source'),
    )

    const columns = h('div', { class: 'pld-list', 'data-testid': 'columns' })
    block.columns.forEach((c, i) => {
      const edit = (fn: (col: Column) => void, rerender = false) => {
        const apply = (b: Block<'table'>) => fn(b.columns[i]!)
        rerender ? structural(apply) : this.editFlow<'table'>(index, apply)
      }
      const fieldControl = list
        ? this.fields.select(T('prop.field'), list.fields.map((f) => [f.key, f.label] as const), c.field, (v) => edit((col) => void (col.field = v), true), `col-${i}-field`)
        : this.fields.text(T('prop.field'), c.field, (v) => edit((col) => void (col.field = v)), `col-${i}-field`)
      columns.append(
        h(
          'div',
          { class: 'pld-group', 'data-testid': `column-${i}` },
          fieldControl,
          this.fields.text(T('prop.title'), c.title, (v) => edit((col) => void (col.title = v)), `col-${i}-title`),
          this.fields.text(T('prop.w'), String(c.width), (v) => {
            const n = Number(v)
            edit((col) => void (col.width = v === '*' || v === 'auto' ? v : Number.isFinite(n) && n > 0 ? n : col.width))
          }, `col-${i}-width`),
          this.fields.select(T('prop.align'), (['left', 'center', 'right'] as const).map((a) => [a, T(`align.${a}` as const)] as const), c.align, (v) => edit((col) => void (col.align = v as Column['align'])), `col-${i}-align`),
          this.fields.select(T('prop.format'), FORMATS.map((f) => [f, T(`format.${f.split(':')[0] as 'text'}` as const) + (f.includes(':') ? ` (${f.split(':')[1]})` : '')] as const), c.format, (v) => edit((col) => void (col.format = v)), `col-${i}-format`),
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
      this.fields.color(T('prop.headerFill'), block.style.headerFill, (v) => this.editFlow<'table'>(index, (b) => void (b.style.headerFill = v)), 'header-fill', true),
      this.fields.check(T('prop.zebra'), block.style.zebra, (v) => this.editFlow<'table'>(index, (b) => void (b.style.zebra = v)), 'zebra'),
      this.fields.select(T('prop.borders'), (['none', 'horizontal', 'grid'] as const).map((b) => [b, T(`borders.${b}` as const)] as const), block.style.borders, (v) => this.editFlow<'table'>(index, (b) => void (b.style.borders = v as Block<'table'>['style']['borders'])), 'borders'),
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
          this.fields.text(T('prop.label'), r.label, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.label = v)), `row-${i}-label`),
          this.fields.text(T('prop.value'), r.value, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.value = v)), `row-${i}-value`),
          this.fields.check(T('prop.bold'), r.bold, (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.bold = v)), `row-${i}-bold`),
          this.fields.check(T('prop.lineAbove'), totalsRowLine(r, i), (v) => this.editFlow<'totals'>(index, (b) => void (b.rows[i]!.line = v)), `row-${i}-line`),
          h('button', { type: 'button', class: 'pld-btn pld-btn-sm is-danger', 'data-testid': `row-${i}-remove`, disabled: block.rows.length === 1, onClick: () => structural((b) => void b.rows.splice(i, 1)) }, T('action.remove')),
        ),
      )
    })
    this.propsEl.append(
      this.fields.num(T('prop.w'), typeof block.width === 'number' ? block.width : 80, (v) => this.editFlow<'totals'>(index, (b) => void (b.width = v)), 'totals-width', { min: 20 }),
      this.fields.select(T('prop.align'), [['left', T('align.left')], ['right', T('align.right')]], block.align, (v) => this.editFlow<'totals'>(index, (b) => void (b.align = v as 'left' | 'right')), 'totals-align'),
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
      (['top', 'bottom', 'left', 'right'] as const).map((side) => this.fields.num(T(`prop.${side}` as const), layout.page.contentBox[key][side], (v) => set((d) => void (d.page.contentBox[key][side] = v)), `page-${key}-${side}`, { min: 0 }))
    this.pageEl.append(
      this.fields.select(T('page.size'), Object.keys(PAGE_SIZES_MM).map((s) => [s, s] as const), layout.page.size, (v) => set((d) => void (d.page.size = v as typeof layout.page.size)), 'page-size'),
      this.fields.select(T('page.orientation'), [['portrait', T('page.portrait')], ['landscape', T('page.landscape')]], layout.page.orientation, (v) => set((d) => void (d.page.orientation = v as 'portrait' | 'landscape')), 'page-orientation'),
      this.fields.text(T('page.locale'), layout.locale, (v) => set((d) => void (d.locale = v)), 'locale'),
      this.fields.text(T('page.currency'), layout.currency, (v) => v.length === 3 && set((d) => void (d.currency = v.toUpperCase())), 'currency'),
      this.fields.select(T('page.defaultFont'), this.fontOptions(layout.page.defaults.font), layout.page.defaults.font, (v) => set((d) => void (d.page.defaults.font = v)), 'default-font'),
      this.fields.num(T('page.defaultSize'), layout.page.defaults.size, (v) => set((d) => void (d.page.defaults.size = v)), 'default-size', { min: 1 }),
      this.fields.color(T('page.defaultColor'), layout.page.defaults.color, (v) => set((d) => void (d.page.defaults.color = v ?? '#222222')), 'default-color'),
      h('button', {
        type: 'button',
        class: 'pld-btn',
        'data-testid': 'clear-guides',
        disabled: !(layout.guides?.x.length || layout.guides?.y.length),
        onClick: () => this.store.update((d) => void (d.guides = undefined)),
      }, T('page.clearGuides', { n: (layout.guides?.x.length ?? 0) + (layout.guides?.y.length ?? 0) })),
      h('div', { class: 'pld-section-title' }, T('page.firstBox')),
      ...box('first'),
      h('div', { class: 'pld-section-title' }, T('page.followBox')),
      ...box('follow'),
    )
  }
}
