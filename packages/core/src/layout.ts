import { CURRENT_SCHEMA_VERSION, LayoutSchema, PAGE_SIZES_MM, PageSchema, type Layout, type LayoutInput, type PageRule, type StaticElement } from './schema'

export class LayoutError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(issues.length ? `${message}: ${issues.join('; ')}` : message)
    this.name = 'LayoutError'
  }
}

/** Upgrades older documents step by step to the current schema version. */
export function migrateLayout(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new LayoutError('Layout must be a JSON object')
  }
  const doc = { ...(input as Record<string, unknown>) }
  const version = doc.schemaVersion === undefined ? 1 : doc.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new LayoutError(`Invalid schemaVersion ${JSON.stringify(version)}`)
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new LayoutError(`Layout schemaVersion ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}; update the library`)
  }
  // Future migrations go here: `if (version < 2) { ...; doc.schemaVersion = 2 }`
  doc.schemaVersion = CURRENT_SCHEMA_VERSION
  return migrateLegacyFooter(doc)
}

type PageGeometry = Pick<Layout['page'], 'size' | 'orientation' | 'contentBox'>

/**
 * The "Seite x von y" element: a normal Static Element (movable, editable, deletable) that uses the
 * `{{page}}` and `{{pages}}` variables. It sits where the old fixed footer was: just below the content box.
 */
export function pageNumberElement(page: PageGeometry, id = 'pagenumber', overrides: Partial<Extract<StaticElement, { type: 'text' }>> = {}): StaticElement {
  const { w, h } = PAGE_SIZES_MM[page.size]
  const [width, height] = page.orientation === 'landscape' ? [h, w] : [w, h]
  const { first, follow } = page.contentBox
  return {
    id,
    type: 'text',
    pages: 'all',
    x: first.left,
    y: Math.round((height - Math.max(first.bottom, follow.bottom) + 3.5) * 100) / 100,
    w: Math.round((width - first.left - first.right) * 100) / 100,
    content: 'Seite {{page}} von {{pages}}',
    size: 8,
    align: 'right',
    ...overrides,
  }
}

/** Older layouts carried a fixed `page.footer`; it becomes an ordinary text element so nothing changes visually. */
function migrateLegacyFooter(doc: Record<string, unknown>): Record<string, unknown> {
  const page = doc.page
  if (typeof page !== 'object' || page === null || !('footer' in page)) return doc
  const { footer, ...rest } = page as Record<string, unknown>
  const next: Record<string, unknown> = { ...doc, page: rest }
  const f = footer as { content?: unknown; align?: unknown; size?: unknown; font?: unknown } | null | undefined
  if (!f || typeof f.content !== 'string' || f.content === '') return next
  const geometry = PageSchema.safeParse(rest)
  const element = pageNumberElement(geometry.success ? geometry.data : PageSchema.parse({}), 'footer', {
    content: f.content,
    ...(f.align === 'left' || f.align === 'center' || f.align === 'right' ? { align: f.align } : {}),
    ...(typeof f.size === 'number' && f.size > 0 ? { size: f.size } : {}),
    ...(typeof f.font === 'string' ? { font: f.font } : {}),
  })
  const existing = Array.isArray(doc.static) ? (doc.static as { id?: unknown }[]) : []
  const ids = new Set(existing.map((e) => e.id))
  let id = 'footer'
  for (let n = 2; ids.has(id); n++) id = `footer_${n}`
  next.static = [...existing, { ...element, id }]
  return next
}

/** Validates (and migrates) unknown input into a normalised Layout, filling defaults. */
export function parseLayout(input: unknown): Layout {
  const result = LayoutSchema.safeParse(migrateLayout(input))
  if (!result.success) {
    throw new LayoutError(
      'Invalid layout',
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }
  const layout = result.data
  const ids = new Set<string>()
  for (const el of layout.static) {
    if (ids.has(el.id)) throw new LayoutError('Invalid layout', [`static: duplicate element id "${el.id}"`])
    ids.add(el.id)
    if (el.type === 'image' && !layout.assets[el.asset]) {
      throw new LayoutError('Invalid layout', [`static.${el.id}: unknown asset "${el.asset}"`])
    }
  }
  return layout
}

/** A new layout as the Designer starts it: A4, empty, with the page-number element in place (delete or edit it freely). */
export function createDefaultLayout(overrides: Partial<LayoutInput> = {}): Layout {
  const base = parseLayout({ schemaVersion: CURRENT_SCHEMA_VERSION, ...overrides })
  if (overrides.static) return base
  return { ...base, static: [parseLayout({ schemaVersion: CURRENT_SCHEMA_VERSION, static: [pageNumberElement(base.page)] }).static[0]!] }
}

/** An empty A4 layout without any elements. */
export function createEmptyLayout(overrides: Partial<LayoutInput> = {}): Layout {
  return parseLayout({ schemaVersion: CURRENT_SCHEMA_VERSION, ...overrides })
}

/** Drops assets that no element references any more. */
export function pruneAssets(layout: Layout): Layout {
  const used = new Set(layout.static.filter((e) => e.type === 'image').map((e) => (e as { asset: string }).asset))
  const assets = Object.fromEntries(Object.entries(layout.assets).filter(([key]) => used.has(key)))
  return { ...layout, assets }
}

/** Page size in mm with the orientation applied. */
export function pageSizeMm(layout: Layout): { w: number; h: number } {
  const { w, h } = PAGE_SIZES_MM[layout.page.size]
  return layout.page.orientation === 'landscape' ? { w: h, h: w } : { w, h }
}

/** Whether a Page Rule draws on a page, given whether it is the first / last page of its Record. */
export function pageRuleMatches(rule: PageRule, isFirst: boolean, isLast: boolean): boolean {
  switch (rule) {
    case 'all':
      return true
    case 'first':
      return isFirst
    case 'notFirst':
      return !isFirst
    case 'last':
      return isLast
  }
}

/** Assets are either bitmap data URLs or inline SVG markup. */
export function isSvgAsset(data: string): boolean {
  return data.trimStart().startsWith('<')
}
