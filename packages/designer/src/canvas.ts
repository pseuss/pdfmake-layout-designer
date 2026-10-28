import { ADDRESS_PRESETS, applyFormatter, isSvgAsset, pageRuleMatches, pageSizeMm, type FlowBlock, type Layout, type StaticElement } from '@pdf-layouter/core'
import { clear, h } from './dom'
import { cssFontFamily } from './fonts'
import { moveStatic, staticRect } from './actions'
import { boxToRect, guideTargets, HANDLES, moveRect, rectToBox, resizeRect, round, snapMoveToGuides, snapResizeToGuides, snapValue, type GuideSnap, type GuideTargets, type Handle, type Rect } from './geometry'
import type { Translator } from './i18n'
import type { Store, View } from './store'
import { flowBlockLabel, renderFlowRows, type FlowContext } from './flowcards'
import { previewText } from './warnings'

const MM_PX = 96 / 25.4
const PT_PX = 96 / 72
/** Pull of a guide in screen pixels; at low zoom this covers more millimetres. */
const GUIDE_PULL_PX = 6

interface Session {
  startX: number
  startY: number
  moved: boolean
  live: (dxMm: number, dyMm: number, e: PointerEvent) => void
  commit: (dxMm: number, dyMm: number, e: PointerEvent) => void
  /** Called instead of `commit` when the pointer did not move (a plain click). */
  tap?: () => void
}


export class Canvas {
  /** Rulers + stage; this is what the Designer puts into its centre column. */
  readonly element: HTMLElement
  readonly stage: HTMLElement
  private hRuler: HTMLElement
  private vRuler: HTMLElement
  private page: HTMLElement
  private session: Session | undefined

  constructor(
    private store: Store,
    private t: Translator,
    private readout: HTMLElement,
  ) {
    this.page = h('div', { class: 'pld-page', 'data-testid': 'page' })
    this.stage = h('div', { class: 'pld-stage', tabIndex: 0, 'data-testid': 'stage' }, this.page)
    this.hRuler = h('div', { class: 'pld-ruler pld-ruler-h', 'data-testid': 'ruler-h', title: t('ruler.hint') })
    this.vRuler = h('div', { class: 'pld-ruler pld-ruler-v', 'data-testid': 'ruler-v', title: t('ruler.hint') })
    this.element = h('div', { class: 'pld-canvas' }, h('div', { class: 'pld-ruler-corner' }), this.hRuler, this.vRuler, this.stage)
    // dragging out of a ruler creates a guide: the horizontal ruler makes horizontal lines (y), the vertical one vertical lines (x)
    this.hRuler.addEventListener('pointerdown', (e) => e.button === 0 && this.startGuideDrag(e, 'y'))
    this.vRuler.addEventListener('pointerdown', (e) => e.button === 0 && this.startGuideDrag(e, 'x'))
    this.stage.addEventListener('scroll', () => this.renderRulers())
    // dragging on empty space draws a selection rectangle; a plain click deselects
    this.page.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target === this.page || (e.target as HTMLElement).classList.contains('pld-grid'))) this.startMarquee(e)
    })
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && e.target === this.stage) this.startMarquee(e)
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

  private get guideThreshold(): number {
    return Math.max(1.2, GUIDE_PULL_PX / this.scale)
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
      // fine lines at the grid step, stronger lines every 10 mm to keep orientation
      const minor = `${this.store.grid * this.scale}px`
      const major = `${10 * this.scale}px`
      const line = (dir: string, alpha: number) => `linear-gradient(${dir}, rgba(0,0,0,${alpha}) 1px, transparent 1px)`
      const withMajor = this.store.grid < 10
      this.page.append(
        h('div', {
          class: 'pld-grid',
          style: {
            backgroundImage: [...(withMajor ? [line('to right', 0.14), line('to bottom', 0.14)] : []), line('to right', 0.06), line('to bottom', 0.06)].join(', '),
            backgroundSize: [...(withMajor ? [`${major} ${major}`, `${major} ${major}`] : []), `${minor} ${minor}`, `${minor} ${minor}`].join(', '),
          },
        }),
      )
    }

    for (const el of layout.static) this.page.append(this.renderStatic(el, layout))
    this.page.append(this.renderContentBox(layout, view, selection.kind === 'contentBox'))
    if (this.store.showGuideLines) this.renderUserGuides(layout, page)
    this.renderRulers()
  }

  // ---- rulers and user guides ---------------------------------------------------------

  private renderUserGuides(layout: Layout, page: { w: number; h: number }): void {
    const make = (axis: 'x' | 'y', value: number, index: number) => {
      const vertical = axis === 'x'
      const guide = h('div', {
        class: `pld-uguide ${vertical ? 'is-v' : 'is-h'}`,
        'data-testid': `uguide-${axis}-${index}`,
        'data-axis': axis,
        'data-index': index,
        'data-mm': value,
        title: `${value} mm`,
        style: vertical ? { left: `${round(value * this.scale) - 3}px`, top: '0', height: this.px(page.h) } : { top: `${round(value * this.scale) - 3}px`, left: '0', width: this.px(page.w) },
      })
      guide.addEventListener('pointerdown', (e) => e.button === 0 && this.startGuideDrag(e, axis, index))
      guide.addEventListener('dblclick', () => this.removeGuide(axis, index))
      this.page.append(guide)
    }
    layout.guides?.x.forEach((v, i) => make('x', v, i))
    layout.guides?.y.forEach((v, i) => make('y', v, i))
  }

  private removeGuide(axis: 'x' | 'y', index: number): void {
    this.store.update((d) => void d.guides?.[axis].splice(index, 1), 'canvas')
  }

  /** Draws both rulers (mm, scaled with the zoom) aligned with the page, whatever the scroll position. */
  private renderRulers(): void {
    const page = pageSizeMm(this.store.layout)
    const k = this.scale
    const pr = this.page.getBoundingClientRect()
    const fill = (ruler: HTMLElement, vertical: boolean, offset: number, length: number) => {
      clear(ruler)
      const inner = h('div', { class: 'pld-ruler-inner' })
      const along = vertical ? 'top' : 'left'
      const size = vertical ? 'height' : 'width'
      Object.assign(inner.style, { [along]: `${offset}px`, [size]: `${length * k}px` })
      const dir = vertical ? 'to bottom' : 'to right'
      const tick = (mm: number, thickness: string) => `linear-gradient(${dir}, #9ca3af 1px, transparent 1px) ${vertical ? `100% 0 / ${thickness} ${mm * k}px repeat-y` : `0 100% / ${mm * k}px ${thickness} repeat-x`}`
      inner.style.background = `${tick(10, '70%')}, ${tick(5, '35%')}`
      for (let mm = 0; mm <= length; mm += 10) {
        inner.append(h('span', { class: 'pld-ruler-label', style: { [along]: `${mm * k + 2}px` } }, String(mm)))
      }
      ruler.append(inner)
    }
    const hr = this.hRuler.getBoundingClientRect()
    const vr = this.vRuler.getBoundingClientRect()
    fill(this.hRuler, false, pr.left - hr.left, page.w)
    fill(this.vRuler, true, pr.top - vr.top, page.h)
  }

  /** Creates a guide (`index` undefined) or moves an existing one; dropping it outside the page deletes it. */
  private startGuideDrag(e: PointerEvent, axis: 'x' | 'y', index?: number): void {
    const page = pageSizeMm(this.store.layout)
    const limit = axis === 'x' ? page.w : page.h
    const { grid, snap } = this.store
    const valueAt = (ev: PointerEvent) => {
      const p = this.pointToMm(ev)
      const raw = axis === 'x' ? p.x : p.y
      return { value: round(snap ? snapValue(raw, grid, true) : Math.round(raw * 2) / 2), inside: raw >= 0 && raw <= limit }
    }
    const temp = h('div', { class: `pld-uguide is-temp ${axis === 'x' ? 'is-v' : 'is-h'}`, 'data-testid': 'uguide-temp' })
    const existing = index === undefined ? undefined : this.page.querySelector<HTMLElement>(`[data-testid="uguide-${axis}-${index}"]`)
    this.beginSession(e, {
      live: (_dx, _dy, ev) => {
        const { value, inside } = valueAt(ev)
        if (!temp.isConnected) this.page.append(temp)
        if (existing) existing.style.display = 'none'
        const at = `${round(value * this.scale) - 3}px`
        Object.assign(temp.style, axis === 'x' ? { left: at, top: '0', height: this.px(page.h), opacity: inside ? '1' : '.3' } : { top: at, left: '0', width: this.px(page.w), opacity: inside ? '1' : '.3' })
        this.readout.textContent = `${axis === 'x' ? 'x' : 'y'} ${value.toFixed(1)} mm`
      },
      commit: (_dx, _dy, ev) => {
        const { value, inside } = valueAt(ev)
        if (index === undefined && !inside) return // dropped outside the page: no guide
        this.store.update((d) => {
          const guides = (d.guides ??= { x: [], y: [] })
          if (index === undefined) {
            if (!guides[axis].includes(value)) guides[axis].push(value)
          } else if (inside) guides[axis][index] = value
          else guides[axis].splice(index, 1)
        }, 'canvas')
      },
    })
  }

  // ---- static elements ---------------------------------------------------------

  private renderStatic(el: StaticElement, layout: Layout): HTMLElement {
    const selected = this.store.selectedStaticIds().includes(el.id)
    const single = selected && this.store.selection.kind === 'static' // resize handles only for a single selection
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
    const renderText = (text: string, into: HTMLElement) => {
      // keep unresolved placeholders visible and highlighted
      const resolved = previewText(text, this.store.sampleData, fmt)
      const parts = resolved.split(/(\{\{[^{}]*\}\})/)
      for (const part of parts) into.append(part.startsWith('{{') ? h('span', { class: 'pld-missing' }, part) : part)
    }

    // one renderer per Static Element type
    const renderers: { [K in StaticElement['type']]: (el: Extract<StaticElement, { type: K }>) => void } = {
      image: (el) => {
        const asset = layout.assets[el.asset]
        this.placeRect(node, el)
        if (asset) {
          const src = isSvgAsset(asset.data) ? `data:image/svg+xml;utf8,${encodeURIComponent(asset.data)}` : asset.data
          node.append(h('img', { src, alt: '', draggable: false }))
        }
        if (single) this.addHandles(node, HANDLES)
      },
      rect: (el) => {
        this.placeRect(node, el)
        Object.assign(node.style, {
          background: el.fill ?? 'transparent',
          border: el.stroke ? `${Math.max(1, el.stroke.width * PT_PX * this.store.zoom)}px solid ${el.stroke.color}` : 'none',
          borderRadius: this.px(el.radius),
        })
        if (single) this.addHandles(node, HANDLES)
      },
      line: (el) => {
        this.layoutLine(node, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }, el)
        if (single) {
          const at = (fromStart: boolean, startLow: boolean) => (fromStart === startLow ? '-6px' : 'calc(100% - 6px)')
          const handle = (name: string, left: string, top: string) => h('div', { class: 'pld-handle', 'data-handle': name, style: { left, top, cursor: 'crosshair' } })
          // p1 sits on the first endpoint, which is not always the top-left corner of the bounding box
          node.append(handle('p1', at(true, el.x1 <= el.x2), at(true, el.y1 <= el.y2)), handle('p2', at(false, el.x1 <= el.x2), at(false, el.y1 <= el.y2)))
        }
      },
      text: (el) => {
        Object.assign(node.style, { left: this.px(el.x), top: this.px(el.y), width: this.px(el.w) })
        textStyle(el)
        renderText(el.content, node)
        if (single) this.addHandles(node, ['e', 'w'])
      },
      address: (el) => {
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
      },
    }
    ;(renderers[el.type] as (el: StaticElement) => void)(el)

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
    inner.append(...renderFlowRows(this.flowContext(layout), rect.w))
    box.append(inner)
    if (selected) for (const handle of HANDLES) box.append(h('div', { class: 'pld-handle', 'data-handle': handle, 'data-testid': `cbox-handle-${handle}`, style: { pointerEvents: 'auto' } }))
    box.querySelectorAll<HTMLElement>('.pld-handle').forEach((el) => el.addEventListener('pointerdown', (e) => this.onContentBoxPointerDown(e, 'resize', el.dataset.handle as Handle)))
    return box
  }

  private flowContext(layout: Layout): FlowContext {
    return {
      layout,
      sampleData: this.store.sampleData,
      zoom: this.store.zoom,
      px: (mm) => this.px(mm),
      t: this.t,
      selectedIndex: this.store.selection.kind === 'flow' ? this.store.selection.index : undefined,
      onSelect: (index) => this.store.select({ kind: 'flow', index }),
    }
  }

  flowCardLabel(block: FlowBlock): string {
    return flowBlockLabel(this.t, block)
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
      this.clearGuides()
      this.page.querySelectorAll('.pld-marquee, .pld-uguide.is-temp').forEach((m) => m.remove())
      if (!s.moved) s.tap?.()
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
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // modifier click toggles the element in a multi-selection
      e.preventDefault()
      e.stopPropagation()
      this.store.toggleStatic(el.id)
      return
    }
    if (!handle && this.isBackground(el) && !this.store.selectedStaticIds().includes(el.id)) {
      // a page-sized background would swallow every drag: dragging over it draws a selection rectangle, a click selects it
      this.startMarquee(e, el.id)
      return
    }
    const group = this.store.selectedStaticIds()
    if (group.length > 1 && group.includes(el.id) && !handle) {
      this.moveGroup(e, group)
      return
    }
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
    const targets = snap ? this.guideTargetsFor([el.id]) : undefined
    const compute = (dx: number, dy: number, ev: PointerEvent): GuideSnap => {
      const r = handle
        ? resizeRect(base, handle as Handle, dx, dy, { grid, snap, minSize: 2, aspect: aspect && !ev.altKey ? aspect : undefined })
        : moveRect(base, dx, dy, grid, snap)
      if (!targets || ev.altKey) return { rect: r, x: [], y: [] }
      // no guides while the aspect ratio of an image is locked: they would distort it
      if (handle && aspect) return { rect: r, x: [], y: [] }
      return handle ? snapResizeToGuides(r, handle as Handle, targets, this.guideThreshold, 2) : snapMoveToGuides(r, targets, this.guideThreshold)
    }
    this.beginSession(e, {
      live: (dx, dy, ev) => {
        const g = compute(dx, dy, ev)
        const r = g.rect
        this.showGuides(g.x, g.y)
        if (el.type === 'text') Object.assign(fresh.style, { left: this.px(r.x), top: this.px(r.y), width: this.px(r.w) })
        else this.placeRect(fresh, r)
      },
      commit: (dx, dy, ev) => {
        const r = compute(dx, dy, ev).rect
        this.store.update((d) => {
          const t = d.static.find((x) => x.id === el.id)
          if (!t) return
          if (t.type === 'text') Object.assign(t, { x: r.x, y: r.y, w: r.w })
          else if (t.type === 'image' || t.type === 'rect') Object.assign(t, r)
        }, 'canvas')
      },
    })
  }

  /** Elements covering (nearly) the whole page, such as the stationery. */
  private isBackground(el: StaticElement): boolean {
    if (el.type !== 'image' && el.type !== 'rect') return false
    const page = pageSizeMm(this.store.layout)
    return el.w >= page.w * 0.9 && el.h >= page.h * 0.9
  }

  /** Rubber-band selection: selects the movable static elements the rectangle touches (shift/ctrl adds to the selection). */
  private startMarquee(e: PointerEvent, tapId?: string): void {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const origin = this.page.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const box = h('div', { class: 'pld-marquee', 'data-testid': 'marquee' })
    const area = (ev: PointerEvent) => ({
      left: Math.min(startX, ev.clientX),
      top: Math.min(startY, ev.clientY),
      right: Math.max(startX, ev.clientX),
      bottom: Math.max(startY, ev.clientY),
    })
    this.beginSession(e, {
      tap: () => {
        if (tapId) this.store.select({ kind: 'static', id: tapId })
        else if (!additive) this.store.select({ kind: 'none' })
      },
      live: (_dx, _dy, ev) => {
        const a = area(ev)
        Object.assign(box.style, { left: `${a.left - origin.left}px`, top: `${a.top - origin.top}px`, width: `${a.right - a.left}px`, height: `${a.bottom - a.top}px` })
        if (!box.isConnected) this.page.append(box)
      },
      commit: (_dx, _dy, ev) => {
        const a = area(ev)
        const hits = this.store.layout.static
          .filter((el) => el.type !== 'address' && !this.isBackground(el))
          .filter((el) => {
            const node = this.page.querySelector<HTMLElement>(`[data-id="${CSS.escape(el.id)}"]`)
            if (!node) return false
            const r = node.getBoundingClientRect()
            return r.right >= a.left && r.left <= a.right && r.bottom >= a.top && r.top <= a.bottom
          })
          .map((el) => el.id)
        const ids = additive ? [...new Set([...this.store.selectedStaticIds(), ...hits])] : hits
        this.store.select(ids.length === 0 ? { kind: 'none' } : ids.length === 1 ? { kind: 'static', id: ids[0]! } : { kind: 'multi', ids })
      },
    })
  }

  /** Alignment targets for guides: other elements, page edges and centres, and the content box. */
  private guideTargetsFor(excludeIds: string[]): GuideTargets {
    const { layout, view } = this.store
    const page = pageSizeMm(layout)
    const others = layout.static.filter((x) => !excludeIds.includes(x.id)).map(staticRect)
    return guideTargets(others, page, boxToRect(layout.page.contentBox[view], page), layout.guides)
  }

  private showGuides(xs: number[], ys: number[]): void {
    this.clearGuides()
    const page = pageSizeMm(this.store.layout)
    for (const x of xs) this.page.append(h('div', { class: 'pld-guide', 'data-testid': 'guide-x', style: { left: this.px(x), top: '0', width: '1px', height: this.px(page.h) } }))
    for (const y of ys) this.page.append(h('div', { class: 'pld-guide', 'data-testid': 'guide-y', style: { top: this.px(y), left: '0', height: '1px', width: this.px(page.w) } }))
  }

  private clearGuides(): void {
    this.page.querySelectorAll('.pld-guide').forEach((g) => g.remove())
  }

  /** Drags all selected elements together; the group snaps as one rectangle. */
  private moveGroup(e: PointerEvent, ids: string[]): void {
    const { grid, snap } = this.store
    const els = this.store.layout.static.filter((x) => ids.includes(x.id) && x.type !== 'address')
    if (!els.length) return
    const rects = els.map(staticRect)
    const left = Math.min(...rects.map((r) => r.x))
    const top = Math.min(...rects.map((r) => r.y))
    const union: Rect = { x: left, y: top, w: Math.max(...rects.map((r) => r.x + r.w)) - left, h: Math.max(...rects.map((r) => r.y + r.h)) - top }
    const targets = snap ? this.guideTargetsFor(ids) : undefined
    const delta = (dx: number, dy: number, ev: PointerEvent) => {
      const m = moveRect(union, dx, dy, grid, snap)
      const g = targets && !ev.altKey ? snapMoveToGuides(m, targets, this.guideThreshold) : { rect: m, x: [], y: [] }
      return { dx: round(g.rect.x - union.x), dy: round(g.rect.y - union.y), g }
    }
    const nodes = els.map((x) => this.page.querySelector<HTMLElement>(`[data-id="${CSS.escape(x.id)}"]`)).filter((n): n is HTMLElement => !!n)
    this.beginSession(e, {
      live: (dx, dy, ev) => {
        const d = delta(dx, dy, ev)
        for (const n of nodes) n.style.transform = `translate(${d.dx * this.scale}px, ${d.dy * this.scale}px)`
        this.showGuides(d.g.x, d.g.y)
      },
      commit: (dx, dy, ev) => {
        const d = delta(dx, dy, ev)
        moveStatic(this.store, els.map((x) => x.id), d.dx, d.dy)
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
