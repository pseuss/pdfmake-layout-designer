import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import type { RichBlock } from '@pdf-layouter/core'
import { h } from './dom'
import type { Translator } from './i18n'
import { blocksToDoc, docToBlocks, type PmNode } from './richtext-adapter'

/** Rich text editor for Text Blocks, built on the framework-agnostic Tiptap core. */
export class RichTextEditor {
  readonly element: HTMLElement
  private editor: Editor
  private buttons: { name: string; el: HTMLButtonElement; active: () => boolean }[] = []

  constructor(blocks: RichBlock[], private t: Translator, onChange: (blocks: RichBlock[]) => void) {
    const bar = h('div', { class: 'pld-rich-bar' })
    const body = h('div', { 'data-testid': 'rich-editor' })
    this.element = h('div', { class: 'pld-rich' }, bar, body)

    this.editor = new Editor({
      element: body,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          link: false,
          trailingNode: false,
        }),
        TextStyle,
        Color,
        FontSize,
        TextAlign.configure({ types: ['paragraph'] }),
      ],
      content: blocksToDoc(blocks),
      onUpdate: ({ editor }) => onChange(docToBlocks(editor.getJSON() as PmNode)),
      onTransaction: () => this.syncButtons(),
    })

    const add = (name: string, label: string, text: string, run: () => void, active: () => boolean) => {
      const el = h('button', { type: 'button', class: 'pld-btn pld-btn-sm', title: label, 'aria-label': label, 'data-testid': `rich-${name}`, onClick: run }, text)
      // keep focus and selection in the editor when a toolbar button is pressed
      el.addEventListener('mousedown', (e) => e.preventDefault())
      bar.append(el)
      this.buttons.push({ name, el, active })
    }
    const chain = () => this.editor.chain().focus()
    add('bold', t('rich.bold'), 'B', () => chain().toggleBold().run(), () => this.editor.isActive('bold'))
    add('italic', t('rich.italic'), 'I', () => chain().toggleItalic().run(), () => this.editor.isActive('italic'))
    add('underline', t('rich.underline'), 'U', () => chain().toggleUnderline().run(), () => this.editor.isActive('underline'))
    add('bullets', t('rich.bullets'), '•', () => chain().toggleBulletList().run(), () => this.editor.isActive('bulletList'))
    add('numbers', t('rich.numbers'), '1.', () => chain().toggleOrderedList().run(), () => this.editor.isActive('orderedList'))

    // colour, size and paragraph alignment
    const color = h('input', { type: 'color', class: 'pld-input', title: t('rich.color'), 'aria-label': t('rich.color'), 'data-testid': 'rich-color', value: '#222222', style: { width: '30px', height: '26px', padding: '0' } })
    color.addEventListener('change', () => chain().setColor(color.value).run())
    const noColor = h('button', { type: 'button', class: 'pld-btn pld-btn-sm', title: t('rich.noColor'), 'aria-label': t('rich.noColor'), 'data-testid': 'rich-no-color', onClick: () => chain().unsetColor().run() }, '⌀')
    noColor.addEventListener('mousedown', (e) => e.preventDefault())
    const size = h('input', { type: 'number', class: 'pld-input', min: '4', max: '96', step: '0.5', placeholder: 'pt', title: t('rich.size'), 'aria-label': t('rich.size'), 'data-testid': 'rich-size', style: { width: '56px' } })
    size.addEventListener('change', () => {
      const v = size.valueAsNumber
      if (Number.isFinite(v) && v > 0) chain().setFontSize(`${v}pt`).run()
      else chain().unsetFontSize().run()
    })
    bar.append(color, noColor, size)
    for (const [name, label, symbol] of [['left', t('align.left'), '⇤'], ['center', t('align.center'), '↔'], ['right', t('align.right'), '⇥'], ['justify', t('align.justify'), '☰']] as const) {
      add(`align-${name}`, label, symbol, () => chain().setTextAlign(name).run(), () => this.editor.isActive({ textAlign: name }))
    }
    this.colorInput = color
    this.sizeInput = size
    this.syncButtons()
  }

  private colorInput!: HTMLInputElement
  private sizeInput!: HTMLInputElement

  private syncButtons(): void {
    for (const b of this.buttons) b.el.setAttribute('aria-pressed', String(b.active()))
    const style = this.editor.getAttributes('textStyle') as { color?: string | null; fontSize?: string | null }
    if (this.colorInput && document.activeElement !== this.colorInput) this.colorInput.value = /^#[0-9a-f]{6}$/i.test(style.color ?? '') ? style.color! : '#222222'
    if (this.sizeInput && document.activeElement !== this.sizeInput) this.sizeInput.value = style.fontSize ? String(parseFloat(style.fontSize)) : ''
  }

  insertText(text: string): void {
    this.editor.chain().focus().insertContent(text).run()
  }

  destroy(): void {
    this.editor.destroy()
  }
}
