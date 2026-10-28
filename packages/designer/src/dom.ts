type Child = Node | string | number | null | undefined | false

/** Tiny hyperscript helper: `h('div', { class: 'x', onClick }, child, 'text')`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') el.className = String(value)
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value)
    else if (/^on[A-Z]/.test(key) && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') el.setAttribute(key, String(value))
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value
    else el.setAttribute(key, String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** `<input type=color>` only accepts #rrggbb. */
export function toHex6(color: string | undefined, fallback = '#000000'): string {
  if (!color) return fallback
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  return /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7).toLowerCase() : fallback
}
