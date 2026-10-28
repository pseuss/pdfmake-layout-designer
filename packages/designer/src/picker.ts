import { h } from './dom'
import type { Translator } from './i18n'
import type { PlaceholderCatalog } from './warnings'

export const FORMATTERS = ['', 'date', 'currency', 'number', 'number:2'] as const

/** Builds the `{{path | formatter}}` token for the placeholder picker. */
export function buildToken(path: string, formatter: string): string {
  return formatter ? `{{${path} | ${formatter}}}` : `{{${path}}}`
}

/**
 * Placeholder picker: grouped fields from the Host App's catalog (or a free path input without a catalog),
 * an optional formatter and an insert button.
 */
export function createPicker(catalog: PlaceholderCatalog | undefined, t: Translator, onInsert: (token: string) => void, testId = 'picker', options: { pageVars?: boolean } = {}): HTMLElement {
  let control: HTMLSelectElement | HTMLInputElement
  if (catalog?.groups.length) {
    const select = h('select', { class: 'pld-select', 'data-testid': `${testId}-field`, 'aria-label': t('picker.placeholder') }, h('option', { value: '' }, t('picker.placeholder')))
    for (const g of catalog.groups) {
      const group = h('optgroup', { label: g.label })
      for (const f of g.fields) group.append(h('option', { value: `${g.key}.${f.key}`, 'data-field-type': f.type ?? 'text' }, f.label))
      select.append(group)
    }
    control = select
  } else {
    control = h('input', { class: 'pld-input', placeholder: 'kunde.name', 'data-testid': `${testId}-field`, 'aria-label': t('picker.placeholder') })
  }

  const formatter = h('select', { class: 'pld-select', 'data-testid': `${testId}-format`, 'aria-label': t('picker.formatter'), style: { flex: '0 0 90px', minWidth: '70px' } })
  for (const f of FORMATTERS) formatter.append(h('option', { value: f }, f || t('picker.none')))

  // Suggest the formatter that matches the field type, e.g. currency for a currency field.
  control.addEventListener('change', () => {
    if (control instanceof HTMLSelectElement) {
      const type = control.selectedOptions[0]?.dataset.fieldType
      formatter.value = type === 'currency' ? 'currency' : type === 'date' ? 'date' : type === 'number' ? 'number' : ''
    }
  })

  const insert = h(
    'button',
    {
      type: 'button',
      class: 'pld-btn pld-btn-sm',
      'data-testid': `${testId}-insert`,
      onClick: () => {
        const path = control.value.trim()
        if (path) onInsert(buildToken(path, formatter.value))
      },
    },
    t('action.insert'),
  )
  const row = h('div', { class: 'pld-picker' }, control, formatter, insert)
  if (options.pageVars) {
    // built-in variables for page numbers: only meaningful in elements placed on the page, not in flowing text
    const pageButton = (name: 'page' | 'pages', label: string) =>
      h('button', { type: 'button', class: 'pld-btn pld-btn-sm', title: `{{${name}}}`, 'data-testid': `${testId}-${name}`, onClick: () => onInsert(`{{${name}}}`) }, label)
    row.append(pageButton('page', t('picker.page')), pageButton('pages', t('picker.pages')))
  }
  return row
}

/** Inserts text at the cursor of a textarea or input and notifies listeners. */
export function insertAtCursor(input: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  input.value = input.value.slice(0, start) + text + input.value.slice(end)
  const caret = start + text.length
  input.setSelectionRange(caret, caret)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.focus()
}
