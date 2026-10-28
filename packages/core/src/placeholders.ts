export type Data = Record<string, unknown>

export interface Warning {
  code: 'missing-value' | 'unknown-formatter' | 'invalid-value' | 'missing-list' | 'unknown-font' | 'layout' | 'overflow'
  message: string
}

export interface FormatContext {
  locale: string
  currency: string
}

export type Token = { kind: 'text'; value: string } | { kind: 'placeholder'; path: string; formatter?: string; raw: string }

const TOKEN = /\{\{\s*([^{}|]*?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

/** Splits a template into literal text and placeholder tokens. */
export function parseTemplate(template: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const match of template.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ kind: 'text', value: template.slice(last, index) })
    tokens.push({ kind: 'placeholder', path: match[1] ?? '', formatter: match[2] || undefined, raw: match[0] })
    last = index + match[0].length
  }
  if (last < template.length) tokens.push({ kind: 'text', value: template.slice(last) })
  return tokens
}

/** Plain dotted-path lookup (`a.b.0.c`); never evaluates code and ignores inherited properties. */
export function lookup(data: unknown, path: string): unknown {
  if (!path) return undefined
  let current: unknown = data
  for (const segment of path.split('.')) {
    if (FORBIDDEN.has(segment)) return undefined
    if (current === null || typeof current !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function toDate(value: unknown): { date: Date; dateOnly: boolean } | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : { date: value, dateOnly: false }
  if (typeof value === 'string' || typeof value === 'number') {
    const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return { date, dateOnly }
  }
  return undefined
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Applies a formatter spec such as `currency`, `number:2`, `date:long` or `currency:USD`. */
export function applyFormatter(value: unknown, spec: string | undefined, ctx: FormatContext, warn: (w: Warning) => void = () => {}): string {
  const raw = value === null || value === undefined ? '' : typeof value === 'object' && !(value instanceof Date) ? '' : String(value)
  if (!spec || spec === 'text') return raw
  if (value === null || value === undefined || raw === '' && !(value instanceof Date)) return ''
  const [name, arg] = spec.split(':').map((s) => s.trim()) as [string, string | undefined]

  try {
    switch (name) {
      case 'number': {
        const n = toNumber(value)
        if (n === undefined) break
        const digits = arg !== undefined && /^\d+$/.test(arg) ? Number(arg) : undefined
        return new Intl.NumberFormat(ctx.locale, digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
      }
      case 'currency': {
        const n = toNumber(value)
        if (n === undefined) break
        return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: (arg || ctx.currency).toUpperCase() }).format(n)
      }
      case 'date': {
        const parsed = toDate(value)
        if (!parsed) break
        const styles: Record<string, Intl.DateTimeFormatOptions> = {
          short: { dateStyle: 'short' },
          medium: { dateStyle: 'medium' },
          long: { dateStyle: 'long' },
          full: { dateStyle: 'full' },
        }
        const options: Intl.DateTimeFormatOptions = arg && styles[arg] ? styles[arg] : { day: '2-digit', month: '2-digit', year: 'numeric' }
        return new Intl.DateTimeFormat(ctx.locale, parsed.dateOnly ? { ...options, timeZone: 'UTC' } : options).format(parsed.date)
      }
      default:
        warn({ code: 'unknown-formatter', message: `Unknown formatter "${spec}"` })
        return raw
    }
  } catch {
    // Intl throws RangeError for e.g. an invalid currency code
  }
  warn({ code: 'invalid-value', message: `Value ${JSON.stringify(value)} cannot be formatted as "${spec}"` })
  return raw
}

function stringifyValue(token: Extract<Token, { kind: 'placeholder' }>, data: unknown, ctx: FormatContext, warn: (w: Warning) => void): string {
  const value = lookup(data, token.path)
  if (value === undefined || value === null) {
    warn({ code: 'missing-value', message: `No value for placeholder {{${token.path}}}` })
    return ''
  }
  return applyFormatter(value, token.formatter, ctx, warn)
}

/** Replaces all placeholders of a template in a single pass; substituted values are never re-scanned. */
export function resolveTemplate(template: string, data: unknown, ctx: FormatContext, warn: (w: Warning) => void = () => {}): string {
  return parseTemplate(template)
    .map((t) => (t.kind === 'text' ? t.value : stringifyValue(t, data, ctx, warn)))
    .join('')
}

/** Lists the placeholder paths used in a template (for validation and the Designer's warnings). */
export function placeholderPaths(template: string): string[] {
  return parseTemplate(template).flatMap((t) => (t.kind === 'placeholder' ? [t.path] : []))
}

/** Like resolveTemplate, but `{{page}}` and `{{pages}}` are filled from the given counters. */
export function resolvePageTemplate(
  template: string,
  data: unknown,
  ctx: FormatContext,
  page: { page: number; pages: number },
  warn: (w: Warning) => void = () => {},
): string {
  return parseTemplate(template)
    .map((t) => {
      if (t.kind === 'text') return t.value
      if (t.path === 'page') return String(page.page)
      if (t.path === 'pages') return String(page.pages)
      return stringifyValue(t, data, ctx, warn)
    })
    .join('')
}

type ConditionInput =
  | { path: string; op: 'exists' | 'empty' | 'equals' | 'notEquals' | 'gt' | 'gte' | 'lt' | 'lte'; value?: string | number | boolean | undefined }
  | { all: ConditionInput[] }
  | { any: ConditionInput[] }
  | { not: ConditionInput }

function toNumberStrict(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Evaluates a `visibleWhen` condition (a leaf or all / any / not of conditions) against one Record. */
export function evaluateCondition(condition: ConditionInput | undefined, data: unknown): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, data))
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, data))
  if ('not' in condition) return !evaluateCondition(condition.not, data)
  const value = lookup(data, condition.path)
  const present = value !== undefined && value !== null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0)
  switch (condition.op) {
    case 'exists':
      return present
    case 'empty':
      return !present
    case 'equals':
      return present && String(value) === String(condition.value)
    case 'notEquals':
      return !present || String(value) !== String(condition.value)
    default: {
      const left = toNumberStrict(value)
      const right = toNumberStrict(condition.value)
      if (left === undefined || right === undefined) return false
      return condition.op === 'gt' ? left > right : condition.op === 'gte' ? left >= right : condition.op === 'lt' ? left < right : left <= right
    }
  }
}
