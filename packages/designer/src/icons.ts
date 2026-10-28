/** Inline 24×24 stroke icons (Lucide-style paths); they inherit the text colour. */
const PATHS = {
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  line: '<path d="M5 19 19 5"/>',
  rect: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
  address: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  pagenumber: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  flowText: '<path d="M4 6h16M4 12h10M4 18h14"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  totals: '<path d="M18 7V5H6l6 7-6 7h12v-2"/>',
  dynamic: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  pageBreak: '<path d="M3 12h3M10 12h4M18 12h3"/><path d="M8 5h8M8 19h8"/>',
} as const

export type IconName = keyof typeof PATHS

export function icon(name: IconName): SVGSVGElement {
  const wrap = document.createElement('span')
  wrap.innerHTML = `<svg class="pld-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`
  return wrap.firstElementChild as SVGSVGElement
}
