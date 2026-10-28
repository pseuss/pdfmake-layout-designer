import { describe, expect, it } from 'vitest'
import { applyFormatter, evaluateCondition, lookup, parseTemplate, placeholderPaths, resolveTemplate, type Warning } from '@pdf-layouter/core'

const de = { locale: 'de-DE', currency: 'EUR' }
const en = { locale: 'en-US', currency: 'USD' }

describe('lookup', () => {
  it('resolves dotted paths and array indexes', () => {
    const data = { a: { b: [{ c: 'x' }] } }
    expect(lookup(data, 'a.b.0.c')).toBe('x')
    expect(lookup(data, 'a.missing')).toBeUndefined()
    expect(lookup(data, '')).toBeUndefined()
  })

  it('ignores inherited and dangerous properties', () => {
    expect(lookup({}, 'constructor')).toBeUndefined()
    expect(lookup({}, '__proto__')).toBeUndefined()
    expect(lookup({ a: 'text' }, 'a.length')).toBeUndefined()
    expect(lookup({}, 'toString')).toBeUndefined()
  })
})

describe('resolveTemplate', () => {
  it('replaces placeholders and keeps surrounding text', () => {
    expect(resolveTemplate('Hallo {{kunde.name}}, Nr. {{nr}}!', { kunde: { name: 'Anna' }, nr: 7 }, de)).toBe('Hallo Anna, Nr. 7!')
  })

  it('leaves missing values empty and reports a warning', () => {
    const warnings: Warning[] = []
    expect(resolveTemplate('[{{nope}}]', {}, de, (w) => warnings.push(w))).toBe('[]')
    expect(warnings).toEqual([{ code: 'missing-value', message: 'No value for placeholder {{nope}}' }])
  })

  it('treats 0 and false as values, not as missing', () => {
    const warnings: Warning[] = []
    expect(resolveTemplate('{{a}}|{{b}}', { a: 0, b: false }, de, (w) => warnings.push(w))).toBe('0|false')
    expect(warnings).toEqual([])
  })

  it('does not evaluate expressions and does not re-scan substituted values', () => {
    const data = { evil: '{{secret}}', secret: 'S', fn: () => 'x' }
    expect(resolveTemplate('{{evil}}', data, de)).toBe('{{secret}}')
    expect(resolveTemplate('{{1+1}} {{fn()}} {{constructor.name}}', data, de)).toBe('  ')
  })

  it('exposes parse results for tooling', () => {
    expect(parseTemplate('a {{x | currency}} b')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'placeholder', path: 'x', formatter: 'currency', raw: '{{x | currency}}' },
      { kind: 'text', value: ' b' },
    ])
    expect(placeholderPaths('{{a.b}} {{c | date}} text')).toEqual(['a.b', 'c'])
  })
})

describe('formatters', () => {
  it('formats currency with the layout locale and currency', () => {
    expect(applyFormatter(1234.5, 'currency', de)).toBe('1.234,50 €')
    expect(applyFormatter(1234.5, 'currency', en)).toBe('$1,234.50')
    expect(applyFormatter(10, 'currency:CHF', de)).toContain('CHF')
  })

  it('formats numbers with optional digits', () => {
    expect(applyFormatter(1234.5678, 'number', de)).toBe('1.234,568')
    expect(applyFormatter(3, 'number:2', de)).toBe('3,00')
    expect(applyFormatter('2.5', 'number:1', en)).toBe('2.5')
  })

  it('formats dates from ISO strings without timezone shifts', () => {
    expect(applyFormatter('2026-10-28', 'date', de)).toBe('28.10.2026')
    expect(applyFormatter('2026-01-01', 'date', de)).toBe('01.01.2026')
    expect(applyFormatter('2026-10-28', 'date:long', de)).toBe('28. Oktober 2026')
    expect(applyFormatter(new Date(Date.UTC(2026, 9, 28, 12)), 'date', en)).toBe('10/28/2026')
  })

  it('falls back to the raw value and warns on bad input or unknown formatters', () => {
    const warnings: Warning[] = []
    const warn = (w: Warning) => warnings.push(w)
    expect(applyFormatter('abc', 'currency', de, warn)).toBe('abc')
    expect(applyFormatter(5, 'shout', de, warn)).toBe('5')
    expect(applyFormatter(5, 'currency:XXXXX', de, warn)).toBe('5')
    expect(warnings.map((w) => w.code)).toEqual(['invalid-value', 'unknown-formatter', 'invalid-value'])
  })

  it('does not format empty values', () => {
    expect(applyFormatter(null, 'currency', de)).toBe('')
    expect(applyFormatter('', 'number', de)).toBe('')
  })
})

describe('evaluateCondition', () => {
  const data = { a: 'x', zero: 0, no: false, list: [], items: [1], n: 5, nothing: null }
  it('treats missing, null, empty string, false and empty lists as empty (0 counts as a value)', () => {
    for (const path of ['missing', 'nothing', 'no', 'list']) {
      expect(evaluateCondition({ path, op: 'exists' }, data)).toBe(false)
      expect(evaluateCondition({ path, op: 'empty' }, data)).toBe(true)
    }
    for (const path of ['a', 'zero', 'items']) expect(evaluateCondition({ path, op: 'exists' }, data)).toBe(true)
  })
  it('compares values as text and treats no condition as visible', () => {
    expect(evaluateCondition({ path: 'n', op: 'equals', value: 5 }, data)).toBe(true)
    expect(evaluateCondition({ path: 'n', op: 'equals', value: '5' }, data)).toBe(true)
    expect(evaluateCondition({ path: 'n', op: 'notEquals', value: 6 }, data)).toBe(true)
    expect(evaluateCondition({ path: 'missing', op: 'notEquals', value: 6 }, data)).toBe(true)
    expect(evaluateCondition(undefined, data)).toBe(true)
  })
})
