import { lookup, parseTemplate, type Layout } from '@pdf-layouter/core'
import type { Data } from '@pdf-layouter/core'

export interface PlaceholderField {
  key: string
  label: string
  type?: 'text' | 'number' | 'currency' | 'date'
}
export interface PlaceholderGroup {
  key: string
  label: string
  fields: PlaceholderField[]
}
export interface PlaceholderList {
  key: string
  label: string
  fields: PlaceholderField[]
}
export interface PlaceholderCatalog {
  groups: PlaceholderGroup[]
  lists?: PlaceholderList[]
}

export interface DesignerWarning {
  code: 'unknown-placeholder' | 'no-sample-value' | 'unknown-list' | 'unknown-column' | 'large-image' | 'content-box'
  message: string
  /** Element id, or `flow:<index>`. */
  where?: string
}

const RESERVED = new Set(['page', 'pages'])

/** Every template string of a Layout with a location label, for placeholder checks. */
export function layoutTemplates(layout: Layout): { where: string; template: string }[] {
  const out: { where: string; template: string }[] = []
  for (const el of layout.static) {
    if (el.type === 'text' || el.type === 'address') out.push({ where: el.id, template: el.content })
    if (el.type === 'address' && el.returnAddress) out.push({ where: el.id, template: el.returnAddress })
  }
  layout.flow.forEach((block, i) => {
    const where = `flow:${i}`
    if (block.type === 'text') {
      for (const b of block.content) {
        if (b.type === 'paragraph') b.runs.forEach((r) => out.push({ where, template: r.text }))
        else b.items.forEach((runs) => runs.forEach((r) => out.push({ where, template: r.text })))
      }
    } else if (block.type === 'totals') {
      block.rows.forEach((r) => out.push({ where, template: r.label }, { where, template: r.value }))
    }
  })
  return out
}

/** Checks placeholders against the Host App's catalog and the sample data. */
export function collectWarnings(layout: Layout, sampleData: Data, catalog?: PlaceholderCatalog): DesignerWarning[] {
  const warnings: DesignerWarning[] = []
  const seen = new Set<string>()
  const add = (w: DesignerWarning) => {
    const key = `${w.code}|${w.message}|${w.where ?? ''}`
    if (!seen.has(key)) {
      seen.add(key)
      warnings.push(w)
    }
  }
  const known = new Set<string>()
  for (const g of catalog?.groups ?? []) for (const f of g.fields) known.add(`${g.key}.${f.key}`)

  for (const { where, template } of layoutTemplates(layout)) {
    for (const t of parseTemplate(template)) {
      if (t.kind !== 'placeholder' || RESERVED.has(t.path)) continue
      if (catalog && !known.has(t.path)) add({ code: 'unknown-placeholder', message: `{{${t.path}}} is not in the placeholder catalog`, where })
      else if (lookup(sampleData, t.path) === undefined) add({ code: 'no-sample-value', message: `{{${t.path}}} has no value in the sample data`, where })
    }
  }

  const { first, follow } = layout.page.contentBox
  if (first.left !== follow.left || first.right !== follow.right) {
    add({ code: 'content-box', message: 'Left/right margins differ between page 1 and follow-up pages; the page 1 values apply to all pages.' })
  }
  if (first.bottom !== follow.bottom) {
    add({ code: 'content-box', message: 'Bottom margins differ between page 1 and follow-up pages; the larger value applies to all pages.' })
  }
  if (first.top < follow.top) {
    add({ code: 'content-box', message: 'The top margin of page 1 is smaller than on follow-up pages; the smaller value applies to all pages.' })
  }

  const lists = new Map((catalog?.lists ?? []).map((l) => [l.key, l]))
  layout.flow.forEach((block, i) => {
    if (block.type !== 'table' || !catalog) return
    const list = lists.get(block.source)
    if (!list) {
      add({ code: 'unknown-list', message: `List "${block.source}" is not in the placeholder catalog`, where: `flow:${i}` })
      return
    }
    for (const c of block.columns) {
      if (!list.fields.some((f) => f.key === c.field)) add({ code: 'unknown-column', message: `Column "${c.field}" does not exist in list "${list.key}"`, where: `flow:${i}` })
    }
  })
  return warnings
}

/** Replaces placeholders for the canvas; values missing from the sample data stay visible as `{{path}}`. */
export function previewText(template: string, sampleData: Data, format: (value: unknown, formatter: string | undefined) => string): string {
  return parseTemplate(template)
    .map((t) => {
      if (t.kind === 'text') return t.value
      if (RESERVED.has(t.path)) return '1'
      const value = lookup(sampleData, t.path)
      return value === undefined || value === null ? t.raw : format(value, t.formatter)
    })
    .join('')
}
