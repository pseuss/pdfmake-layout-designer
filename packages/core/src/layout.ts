import { CURRENT_SCHEMA_VERSION, LayoutSchema, PAGE_SIZES_MM, type Layout, type LayoutInput, type PageRule } from './schema'

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
  return doc
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

/** An empty A4 layout, as used when the Designer starts without a stored Layout. */
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
