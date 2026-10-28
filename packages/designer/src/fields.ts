import { h, toHex6 } from './dom'
import type { Translator } from './i18n'

/** Labelled form controls of the property panels. */
export class Fields {
  constructor(
    private t: Translator,
    /** Reports the text input that was focused last, so the placeholder picker knows where to insert. */
    private onTextFocus: (input: HTMLInputElement) => void,
  ) {}

  field(label: string, control: HTMLElement, testId?: string, stacked = false): HTMLElement {
    const id = `pld-f-${Math.random().toString(36).slice(2, 8)}`
    control.id ||= id
    return h('div', { class: `pld-field${stacked ? ' is-stacked' : ''}`, 'data-testid': testId ? `field-${testId}` : undefined }, h('label', { for: control.id }, label), control)
  }

  num(label: string, value: number, onChange: (v: number) => void, testId: string, o: { min?: number; step?: number } = {}): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'number', value: String(value), step: String(o.step ?? 0.5), min: o.min !== undefined ? String(o.min) : undefined, 'data-testid': testId })
    input.addEventListener('input', () => {
      const v = input.valueAsNumber
      if (Number.isFinite(v) && (o.min === undefined || v >= o.min)) onChange(v)
    })
    return this.field(label, input, testId)
  }

  text(label: string, value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'text', value, 'data-testid': testId })
    input.addEventListener('input', () => onChange(input.value))
    input.addEventListener('focus', () => this.onTextFocus(input))
    return this.field(label, input, testId)
  }

  select(label: string, options: readonly (readonly [string, string])[], value: string, onChange: (v: string) => void, testId: string): HTMLElement {
    const select = h('select', { class: 'pld-select', 'data-testid': testId })
    for (const [v, text] of options) select.append(h('option', { value: v }, text))
    if (!options.some(([v]) => v === value)) select.append(h('option', { value }, value))
    select.value = value
    select.addEventListener('change', () => onChange(select.value))
    return this.field(label, select, testId)
  }

  color(label: string, value: string | undefined, onChange: (v: string | undefined) => void, testId: string, allowNone = false): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'color', value: toHex6(value), 'data-testid': testId })
    input.addEventListener('input', () => onChange(input.value))
    const row = h('div', { class: 'pld-row' }, input)
    if (allowNone) {
      row.append(h('button', { type: 'button', class: 'pld-btn pld-btn-sm', 'data-testid': `${testId}-none`, onClick: () => onChange(undefined) }, this.t('prop.noFill')))
    }
    return this.field(label, row, testId)
  }

  check(label: string, value: boolean, onChange: (v: boolean) => void, testId: string): HTMLElement {
    const input = h('input', { class: 'pld-input', type: 'checkbox', checked: value, 'data-testid': testId })
    input.addEventListener('change', () => onChange(input.checked))
    return this.field(label, input, testId)
  }
}
