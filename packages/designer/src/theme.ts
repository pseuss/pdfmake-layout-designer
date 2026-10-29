export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

/** `#rgb` or `#rrggbb` (an alpha part is ignored) to channel values, or undefined when it is not a hex colour. */
export function parseHex(color: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())
  if (!m) return undefined
  let hex = m[1]!
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

export function normalizeHex(color: string): string | undefined {
  const rgb = parseHex(color)
  return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}` : undefined
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Text colour that stays readable on the primary colour: white on dark colours, near-black on light ones. */
export function onPrimary(hex: string): '#ffffff' | '#111827' {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  return luminance(rgb) > 0.179 ? '#111827' : '#ffffff'
}

/**
 * `auto` follows the host page: a `dark` / `light` class or a `data-theme` / `data-bs-theme` attribute on `<html>`
 * (Tailwind, Nuxt color-mode, Bootstrap), otherwise the operating system setting.
 */
export function resolveTheme(mode: ThemeMode, doc: Document): ResolvedTheme {
  if (mode !== 'auto') return mode
  const html = doc.documentElement
  const marker = html.getAttribute('data-theme') ?? html.getAttribute('data-bs-theme')
  if (html.classList.contains('dark') || marker === 'dark') return 'dark'
  if (html.classList.contains('light') || marker === 'light') return 'light'
  const view = doc.defaultView
  return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies theme and primary colour to the Designer root and keeps `auto` in sync with the page. */
export class ThemeController {
  private mode: ThemeMode
  private observer: MutationObserver | undefined
  private media: MediaQueryList | undefined
  private onMedia = () => this.apply()
  primary: string | undefined

  constructor(
    private root: HTMLElement,
    mode: ThemeMode = 'auto',
    primaryColor?: string,
  ) {
    this.mode = mode
    const doc = root.ownerDocument
    this.media = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')
    this.media?.addEventListener?.('change', this.onMedia)
    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.mode === 'auto' && this.apply())
      this.observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-bs-theme'] })
    }
    this.apply()
    if (primaryColor !== undefined) this.setPrimary(primaryColor)
  }

  get resolved(): ResolvedTheme {
    return resolveTheme(this.mode, this.root.ownerDocument)
  }

  setMode(mode: ThemeMode): void {
    this.mode = mode
    this.apply()
  }

  /** Sets the accent colour (hex); `undefined` returns to the default. Other colour formats are rejected with a warning. */
  setPrimary(color: string | undefined): void {
    if (color === undefined) {
      this.primary = undefined
      this.root.style.removeProperty('--pld-primary')
      this.root.style.removeProperty('--pld-on-primary')
      return
    }
    const hex = normalizeHex(color)
    if (!hex) {
      console.warn(`[pdfmake-layout-designer] primaryColor must be a hex colour such as "#0d9488", got "${color}"`)
      return
    }
    this.primary = hex
    this.root.style.setProperty('--pld-primary', hex)
    this.root.style.setProperty('--pld-on-primary', onPrimary(hex))
  }

  private apply(): void {
    this.root.setAttribute('data-theme', this.resolved)
  }

  destroy(): void {
    this.observer?.disconnect()
    this.media?.removeEventListener?.('change', this.onMedia)
  }
}
