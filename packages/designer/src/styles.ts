import { CSS } from './styles.generated'

export const STYLE_ID = 'pld-styles'
export { CSS }

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
