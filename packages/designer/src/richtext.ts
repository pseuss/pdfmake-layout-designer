import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
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
    this.syncButtons()
  }

  private syncButtons(): void {
    for (const b of this.buttons) b.el.setAttribute('aria-pressed', String(b.active()))
  }

  insertText(text: string): void {
    this.editor.chain().focus().insertContent(text).run()
  }

  destroy(): void {
    this.editor.destroy()
  }
}
