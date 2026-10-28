import { ADDRESS_PRESETS, applyFormatter, isSvgAsset, pageRuleMatches, pageSizeMm, type FlowBlock, type Layout, type StaticElement } from '@pdf-layouter/core'
import { clear, h } from './dom'
import { cssFontFamily } from './fonts'
import { boxToRect, HANDLES, moveRect, rectToBox, resizeRect, round, snapValue, type Handle, type Rect } from './geometry'
import type { Translator } from './i18n'
import type { Store, View } from './store'
import { previewText } from './warnings'

const MM_PX = 96 / 25.4
const PT_PX = 96 / 72

interface Session {
  startX: number
  startY: number
  moved: boolean
  live: (dxMm: number, dyMm: number, e: PointerEvent) => void
  commit: (dxMm: number, dyMm: number, e: PointerEvent) => void
}

const FLOW_HEIGHT_MM: Record<FlowBlock['type'], number> = { text: 14, table: 40, totals: 20, dynamicSections: 30, pageBreak: 6 }

export class Canvas {
  readonly stage: HTMLElement
  private page: HTMLElement
  private session: Session | undefined

  constructor(
    private store: Store,
    private t: Translator,
    private readout: HTMLElement,
  ) {
    this.page = h('div', { class: 'pld-page', 'data-testid': 'page' })
    this.stage = h('div', { class: 'pld-stage', tabIndex: 0, 'data-testid': 'stage' }, this.page)
    this.page.addEventListener('pointerdown', (e) => {
      if (e.target === this.page || (e.target as HTMLElement).classList.contains('pld-grid')) this.store.select({ kind: 'none' })
    })
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.target === this.stage) this.store.select({ kind: 'none' })
    })
    this.page.addEventListener('pointermove', (e) => {
      const p = this.pointToMm(e)
      this.readout.textContent = `${p.x.toFixed(1)} / ${p.y.toFixed(1)} mm`
    })
  }

  /** Whether a Static Element is drawn on the current view (`last` can also be page 1 of a one-page document). */
  private appliesTo(rule: StaticElement['pages']): boolean {
    const first = this.store.view === 'first'
    return pageRuleMatches(rule, first, !first)
  }

  private get scale(): number {
    return MM_PX * this.store.zoom
  }

  pointToMm(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = this.page.getBoundingClientRect()
    return { x: (e.clientX - box.left) / this.scale, y: (e.clientY - box.top) / this.scale }
  }

  /** Zoom that makes the whole page height fit into the stage. */
  fitZoom(): number {
    const page = pageSizeMm(this.store.layout)
    const avail = this.stage.clientHeight - 48
    return avail > 0 ? Math.max(0.25, Math.min(2, avail / (page.h * MM_PX))) : 1
  }

  private px(mm: number): string {
    return `${round(mm * this.scale)}px`
  }

  private placeRect(el: HTMLElement, r: Rect): void {
    Object.assign(el.style, { left: this.px(r.x), top: this.px(r.y), width: this.px(r.w), height: this.px(r.h) })
  }

  private formatValue(layout: Layout) {
    return (value: unknown, formatter: string | undefined) => applyFormatter(value, formatter, { locale: layout.locale, currency: layout.currency })
  }

  render(): void {
    const { layout, selection, view } = this.store
    const page = pageSizeMm(layout)
    clear(this.page)
    Object.assign(this.page.style, { width: this.px(page.w), height: this.px(page.h) })
    this.page.dataset.scale = String(this.scale)

    if (this.store.showGrid && this.store.grid > 0) {
      const step = `${this.store.grid * this.scale}px`
      this.page.append(
        h('div', {
          class: 'pld-grid',
          style: {
            backgroundImage: 'linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px)',
            backgroundSize: `${step} ${step}`,
          },
        }),
      )
    }

    for (const el of layout.static) this.page.append(this.renderStatic(el, layout))
    this.page.append(this.renderContentBox(layout, view, selection.kind === 'contentBox'))
  }

  // ---- static elements ---------------------------------------------------------

  private renderStatic(el: StaticElement, layout: Layout): HTMLElement {
    const selected = this.store.selection.kind === 'static' && this.store.selection.id === el.id
    const node = h('div', {
      class: `pld-el pld-el-${el.type}${selected ? ' is-selected' : ''}${this.appliesTo(el.pages) ? '' : ' is-dimmed'}`,
      'data-testid': `el-${el.id}`,
      'data-type': el.type,
      'data-id': el.id,
    })
    const textStyle = (e: { font?: string | undefined; size?: number | undefined; color?: string | undefined; bold?: boolean | undefined; italic?: boolean | undefined; align: string }) => {
      const d = layout.page.defaults
      Object.assign(node.style, {
        fontFamily: cssFontFamily(e.font ?? d.font),
        fontSize: `${(e.size ?? d.size) * PT_PX * this.store.zoom}px`,
        color: e.color ?? d.color,
        fontWeight: e.bold ? '700' : '400',
        fontStyle: e.italic ? 'italic' : 'normal',
        textAlign: e.align,
        lineHeight: '1.15',
      })
    }
    const fmt = this.formatValue(layout)
    const renderText = (template: string, into: HTMLElement) => {
      // keep unresolved placeholders visible and highlighted
      const resolved = previewText(template, this.store.sampleData, fmt)
      const parts = resolved.split(/(\{\{[^{}]*\}\})/)
      for (const part of parts) into.append(part.startsWith('{{') ? h('span', { class: 'pld-missing' }, part) : part)
    }

    switch (el.type) {
      case 'image': {
        const asset = layout.assets[el.asset]
        this.placeRect(node, el)
        if (asset) {
          const src = isSvgAsset(asset.data) ? `data:image/svg+xml;utf8,${encodeURIComponent(asset.data)}` : asset.data
          node.append(h('img', { src, alt: '', draggable: false }))
        }
        if (selected) this.addHandles(node, HANDLES)
        break
      }
      case 'rect': {
        this.placeRect(node, el)
        Object.assign(node.style, {
          background: el.fill ?? 'transparent',
          border: el.stroke ? `${Math.max(1, el.stroke.width * PT_PX * this.store.zoom)}px solid ${el.stroke.color}` : 'none',
          borderRadius: this.px(el.radius),
        })
        if (selected) this.addHandles(node, HANDLES)
        break
      }
      case 'line': {
        this.layoutLine(node, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }, el)
        if (selected) {
          const at = (fromStart: boolean, startLow: boolean) => (fromStart === startLow ? '-6px' : 'calc(100% - 6px)')
          const handle = (name: string, left: string, top: string) => h('div', { class: 'pld-handle', 'data-handle': name, style: { left, top, cursor: 'crosshair' } })
          // p1 sits on the first endpoint, which is not always the top-left corner of the bounding box
          node.append(handle('p1', at(true, el.x1 <= el.x2), at(true, el.y1 <= el.y2)), handle('p2', at(false, el.x1 <= el.x2), at(false, el.y1 <= el.y2)))
        }
        break
      }
      case 'text': {
        Object.assign(node.style, { left: this.px(el.x), top: this.px(el.y), width: this.px(el.w) })
        textStyle(el)
        renderText(el.content, node)
        if (selected) this.addHandles(node, ['e', 'w'])
        break
      }
      case 'address': {
        const g = ADDRESS_PRESETS[el.preset]
        this.placeRect(node, { x: g.x, y: g.y, w: g.w, h: g.h })
        const body = h('div', { style: { position: 'absolute', left: '0', right: '0', top: this.px(g.returnHeight), whiteSpace: 'pre-wrap' } })
        textStyle(el)
        if (el.returnAddress) {
          const line = h('div', { style: { position: 'absolute', left: '0', top: this.px(g.returnHeight - 4), fontSize: `${7 * PT_PX * this.store.zoom}px`, textDecoration: 'underline', color: '#555' } })
          renderText(el.returnAddress, line)
          node.append(line)
        }
        renderText(el.content, body)
        node.append(body, h('span', { class: 'pld-tag' }, el.preset))
        break
      }
    }

    node.addEventListener('pointerdown', (e) => this.onElementPointerDown(e, el))
    return node
  }

  private layoutLine(node: HTMLElement, a: { x: number; y: number }, b: { x: number; y: number }, style: { width: number; color: string; dash: string }): void {
    const minThickness = 4 / this.scale
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.max(Math.abs(b.x - a.x), minThickness)
    const hh = Math.max(Math.abs(b.y - a.y), minThickness)
    this.placeRect(node, { x, y, w, h: hh })
    node.querySelector(':scope > svg')?.remove()
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', `0 0 ${w * this.scale} ${hh * this.scale}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', String((a.x - x) * this.scale))
    line.setAttribute('y1', String((a.y - y) * this.scale))
    line.setAttribute('x2', String((b.x - x) * this.scale))
    line.setAttribute('y2', String((b.y - y) * this.scale))
    line.setAttribute('stroke', style.color)
    line.setAttribute('stroke-width', String(Math.max(1, style.width * PT_PX * this.store.zoom)))
    if (style.dash !== 'solid') line.setAttribute('stroke-dasharray', style.dash === 'dashed' ? '6 4' : '1 3')
    svg.append(line)
    node.prepend(svg)
  }

  private addHandles(node: HTMLElement, handles: Handle[]): void {
    for (const handle of handles) node.append(h('div', { class: 'pld-handle', 'data-handle': handle, 'data-testid': `handle-${handle}` }))
  }

  // ---- content box ---------------------------------------------------------------

  private renderContentBox(layout: Layout, view: View, selected: boolean): HTMLElement {
    const page = pageSizeMm(layout)
    const rect = boxToRect(layout.page.contentBox[view], page)
    const box = h('div', { class: `pld-cbox${selected ? ' is-selected' : ''}`, 'data-testid': 'content-box', 'data-view': view })
    this.placeRect(box, rect)
    const label = h('div', { class: 'pld-cbox-label', 'data-testid': 'content-box-label' }, `${this.t('contentBox')} · ${this.t(view === 'first' ? 'view.first' : 'view.follow')}`)
    label.addEventListener('pointerdown', (e) => this.onContentBoxPointerDown(e, 'move'))
    box.append(label)
    const inner = h('div', { class: 'pld-cbox-inner' })
    layout.flow.forEach((block, index) => {
      const isSelected = this.store.selection.kind === 'flow' && this.store.selection.index === index
      const card = h(
        'div',
        {
          class: `pld-flowcard${isSelected ? ' is-selected' : ''}${block.type === 'pageBreak' ? ' is-break' : ''}`,
          'data-testid': `flowcard-${index}`,
          style: { height: this.px(FLOW_HEIGHT_MM[block.type]) },
        },
        this.flowCardLabel(block),
      )
      card.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.store.select({ kind: 'flow', index })
      })
      inner.append(card)
    })
    box.append(inner)
    if (selected) for (const handle of HANDLES) box.append(h('div', { class: 'pld-handle', 'data-handle': handle, 'data-testid': `cbox-handle-${handle}`, style: { pointerEvents: 'auto' } }))
    box.querySelectorAll<HTMLElement>('.pld-handle').forEach((el) => el.addEventListener('pointerdown', (e) => this.onContentBoxPointerDown(e, 'resize', el.dataset.handle as Handle)))
    return box
  }

  flowCardLabel(block: FlowBlock): string {
    switch (block.type) {
      case 'text':
        return this.t('flow.text')
      case 'table':
        return `${this.t('flow.table')}: ${block.source}`
      case 'totals':
        return this.t('flow.totals')
      case 'dynamicSections':
        return `${this.t('flow.dynamicSections')}: ${block.source}`
      case 'pageBreak':
        return this.t('flow.pageBreak')
    }
  }

  // ---- interaction ---------------------------------------------------------------

  private beginSession(e: PointerEvent, session: Omit<Session, 'startX' | 'startY' | 'moved'>): void {
    e.preventDefault()
    e.stopPropagation()
    const s: Session = { ...session, startX: e.clientX, startY: e.clientY, moved: false }
    this.session = s
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - s.startX
      const dy = ev.clientY - s.startY
      if (!s.moved && Math.hypot(dx, dy) < 3) return
      s.moved = true
      s.live(dx / this.scale, dy / this.scale, ev)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      this.session = undefined
      if (s.moved) s.commit((ev.clientX - s.startX) / this.scale, (ev.clientY - s.startY) / this.scale, ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  private onElementPointerDown(e: PointerEvent, el: StaticElement): void {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const node = (e.currentTarget as HTMLElement)!
    const handle = target.dataset.handle
    const { grid, snap } = this.store
    this.store.select({ kind: 'static', id: el.id })
    const fresh = this.page.querySelector<HTMLElement>(`[data-id="${CSS.escape(el.id)}"]`) ?? node

    if (el.type === 'line') {
      const base = { ...el }
      const style = { width: el.width, color: el.color, dash: el.dash }
      const pts = (dx: number, dy: number) => {
        const s = (v: number) => round(snapValue(v, grid, snap))
        if (handle === 'p1') return { a: { x: s(base.x1 + dx), y: s(base.y1 + dy) }, b: { x: base.x2, y: base.y2 } }
        if (handle === 'p2') return { a: { x: base.x1, y: base.y1 }, b: { x: s(base.x2 + dx), y: s(base.y2 + dy) } }
        const m = moveRect({ x: base.x1, y: base.y1, w: 0, h: 0 }, dx, dy, grid, snap)
        return { a: { x: m.x, y: m.y }, b: { x: round(base.x2 + (m.x - base.x1)), y: round(base.y2 + (m.y - base.y1)) } }
      }
      this.beginSession(e, {
        live: (dx, dy) => {
          const { a, b } = pts(dx, dy)
          this.layoutLine(fresh, a, b, style)
        },
        commit: (dx, dy) => {
          const { a, b } = pts(dx, dy)
          this.store.update((d) => {
            const t = d.static.find((x) => x.id === el.id)
            if (t?.type === 'line') Object.assign(t, { x1: a.x, y1: a.y, x2: b.x, y2: b.y })
          }, 'canvas')
        },
      })
      return
    }

    if (el.type === 'address') {
      // The address field has a fixed position defined by its DIN 5008 preset.
      e.preventDefault()
      e.stopPropagation()
      return
    }

    const base: Rect = el.type === 'text' ? { x: el.x, y: el.y, w: el.w, h: Math.max(fresh.offsetHeight / this.scale, 4) } : { x: el.x, y: el.y, w: el.w, h: el.h }
    const aspect = el.type === 'image' ? base.w / base.h : undefined
    const compute = (dx: number, dy: number, ev: PointerEvent): Rect =>
      handle
        ? resizeRect(base, handle as Handle, dx, dy, { grid, snap, minSize: 2, aspect: aspect && !ev.altKey ? aspect : undefined })
        : moveRect(base, dx, dy, grid, snap)
    this.beginSession(e, {
      live: (dx, dy, ev) => {
        const r = compute(dx, dy, ev)
        if (el.type === 'text') Object.assign(fresh.style, { left: this.px(r.x), top: this.px(r.y), width: this.px(r.w) })
        else this.placeRect(fresh, r)
      },
      commit: (dx, dy, ev) => {
        const r = compute(dx, dy, ev)
        this.store.update((d) => {
          const t = d.static.find((x) => x.id === el.id)
          if (!t) return
          if (t.type === 'text') Object.assign(t, { x: r.x, y: r.y, w: r.w })
          else if (t.type === 'image' || t.type === 'rect') Object.assign(t, r)
        }, 'canvas')
      },
    })
  }

  private onContentBoxPointerDown(e: PointerEvent, mode: 'move' | 'resize', handle?: Handle): void {
    if (e.button !== 0) return
    this.store.select({ kind: 'contentBox' })
    const { layout, view, grid, snap } = this.store
    const page = pageSizeMm(layout)
    const base = boxToRect(layout.page.contentBox[view], page)
    const node = this.page.querySelector<HTMLElement>('.pld-cbox')!
    const compute = (dx: number, dy: number): Rect => (mode === 'move' ? moveRect(base, dx, dy, grid, snap) : resizeRect(base, handle!, dx, dy, { grid, snap, minSize: 10 }))
    this.beginSession(e, {
      live: (dx, dy) => this.placeRect(node, compute(dx, dy)),
      commit: (dx, dy) => {
        const box = rectToBox(compute(dx, dy), page)
        this.store.update((d) => {
          d.page.contentBox[view] = box
        }, 'canvas')
      },
    })
  }
}
