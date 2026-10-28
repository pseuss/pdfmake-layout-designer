// @vitest-environment jsdom
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { normalizeHex, onPrimary, parseHex, resolveTheme, ThemeController } from '../src/theme'

describe('colour helpers', () => {
  it('parses and normalises hex colours', () => {
    expect(parseHex('#0d9488')).toEqual([13, 148, 136])
    expect(parseHex('#0d9488ff')).toEqual([13, 148, 136])
    expect(normalizeHex('#F0C')).toBe('#ff00cc')
    for (const bad of ['red', 'rgb(1,2,3)', '#12', '#12345', '0d9488', '']) expect(normalizeHex(bad)).toBeUndefined()
  })

  it('picks readable text for the primary colour', () => {
    for (const dark of ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#000000']) expect(onPrimary(dark)).toBe('#ffffff')
    for (const light of ['#facc15', '#a3e635', '#67e8f9', '#ffffff', '#fde68a']) expect(onPrimary(light)).toBe('#111827')
  })
})

describe('theme resolution and controller', () => {
  it('explicit modes win; auto reads the host page before the OS', () => {
    const html = document.documentElement
    html.className = ''
    html.removeAttribute('data-theme')
    expect(resolveTheme('dark', document)).toBe('dark')
    expect(resolveTheme('light', document)).toBe('light')
    expect(resolveTheme('auto', document)).toBe('light') // jsdom has no dark preference
    html.classList.add('dark')
    expect(resolveTheme('auto', document)).toBe('dark')
    html.classList.remove('dark')
    html.setAttribute('data-bs-theme', 'dark')
    expect(resolveTheme('auto', document)).toBe('dark')
    html.removeAttribute('data-bs-theme')
  })

  it('sets data-theme and the primary custom properties, and restores the default', () => {
    const root = document.createElement('div')
    const c = new ThemeController(root, 'dark', '#facc15')
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.style.getPropertyValue('--pld-primary')).toBe('#facc15')
    expect(root.style.getPropertyValue('--pld-on-primary')).toBe('#111827')
    c.setMode('light')
    expect(root.getAttribute('data-theme')).toBe('light')
    c.setPrimary(undefined)
    expect(root.style.getPropertyValue('--pld-primary')).toBe('')
    c.destroy()
  })
})

describe('generated styles', () => {
  it('are in sync with theme.css (run `node scripts/build-styles.mjs` after editing it)', () => {
    const out = execFileSync('node', ['scripts/build-styles.mjs', '--check'], { encoding: 'utf8' })
    expect(out).toContain('up to date')
  })
})
