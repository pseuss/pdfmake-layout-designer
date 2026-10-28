import { createElement, useEffect, useRef, type CSSProperties, type ReactElement } from 'react'
import type { Data, Layout, LayoutInput } from '@pdf-layouter/core'
import { Designer, type DesignerOptions, type PlaceholderCatalog } from '@pdf-layouter/designer'

export interface LayoutDesignerProps extends Omit<DesignerOptions, 'container' | 'layout' | 'onChange' | 'placeholders' | 'sampleData'> {
  /** The stored Layout JSON. Keep the reference stable between renders; the component calls `onChange` when the user edits. */
  value?: Layout | LayoutInput
  onChange?: (layout: Layout) => void
  placeholders?: PlaceholderCatalog
  sampleData?: Data
  /** Gives access to the underlying Designer, e.g. for `addImage()` or `getWarnings()`. */
  onReady?: (designer: Designer) => void
  className?: string
  style?: CSSProperties
}

/** React wrapper around the framework-agnostic Designer. In Next.js load it with `dynamic(() => import(...), { ssr: false })`. */
export function LayoutDesigner(props: LayoutDesignerProps): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const designer = useRef<Designer | null>(null)
  const lastEmitted = useRef<Layout | LayoutInput | undefined>(undefined)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const p = latest.current
    const instance = new Designer({
      container: host.current!,
      layout: p.value,
      placeholders: p.placeholders,
      sampleData: p.sampleData,
      fonts: p.fonts,
      locale: p.locale,
      images: p.images,
      onChange: (layout) => {
        lastEmitted.current = layout
        latest.current.onChange?.(layout)
      },
    })
    lastEmitted.current = p.value
    designer.current = instance
    p.onReady?.(instance)
    return () => {
      instance.destroy()
      designer.current = null
    }
  }, [])

  useEffect(() => {
    if (props.value !== undefined && props.value !== lastEmitted.current) {
      lastEmitted.current = props.value
      designer.current?.setLayout(props.value)
    }
  }, [props.value])

  useEffect(() => {
    designer.current?.setSampleData(props.sampleData ?? {})
  }, [props.sampleData])

  useEffect(() => {
    designer.current?.setPlaceholders(props.placeholders)
  }, [props.placeholders])

  return createElement('div', { ref: host, className: props.className, style: { height: '100%', ...props.style } })
}

export { Designer }
export type { Data, Layout, LayoutInput, PlaceholderCatalog, DesignerOptions }
