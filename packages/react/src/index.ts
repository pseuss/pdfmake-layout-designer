import { createElement, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import type { Data, Layout, LayoutInput } from '@pdf-layouter/core'
import { Designer, LayoutDocument, pickDesignerOptions, type DesignerOptions, type DocumentStatus, type LayoutDocumentOptions, type PlaceholderCatalog } from '@pdf-layouter/designer'

export interface LayoutDesignerProps extends Omit<DesignerOptions, 'container' | 'layout' | 'onChange' | 'placeholders' | 'sampleData'> {
  /** The stored Layout JSON. A new object with the same content is ignored, so it is fine to pass a fresh one every render. */
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
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const p = latest.current
    const instance = new Designer({
      container: host.current!,
      layout: p.value,
      ...pickDesignerOptions(p),
      onChange: (layout) => latest.current.onChange?.(layout),
    })
    designer.current = instance
    p.onReady?.(instance)
    return () => {
      instance.destroy()
      designer.current = null
    }
  }, [])

  useEffect(() => {
    // by content, not identity: `value={JSON.parse(json)}` or an echo of onChange must not reset the Designer
    const instance = designer.current
    if (props.value !== undefined && instance && !instance.matches(props.value)) instance.setLayout(props.value)
  }, [props.value])

  useEffect(() => {
    designer.current?.setSampleData(props.sampleData ?? {})
  }, [props.sampleData])

  useEffect(() => {
    designer.current?.setPlaceholders(props.placeholders)
  }, [props.placeholders])

  useEffect(() => {
    designer.current?.setTheme(props.theme ?? 'auto')
  }, [props.theme])

  useEffect(() => {
    designer.current?.setPrimaryColor(props.primaryColor)
  }, [props.primaryColor])

  return createElement('div', { ref: host, className: props.className, style: { height: '100%', ...props.style } })
}

export interface UseLayoutDocument {
  /** Pass to `<LayoutDesigner value>`. */
  value: Layout | LayoutInput | undefined
  /** Pass to `<LayoutDesigner onChange>`. */
  onChange: (layout: Layout) => void
  save: () => Promise<void>
  status: DocumentStatus
  error: Error | undefined
}

/**
 * Load, edit and save one stored Layout: `const doc = useLayoutDocument({ load, save })`,
 * then `<LayoutDesigner value={doc.value} onChange={doc.onChange} />` and a button that calls `doc.save()`.
 * Where the JSON lives is up to your `load` and `save` functions.
 */
export function useLayoutDocument(options: LayoutDocumentOptions): UseLayoutDocument {
  const latest = useRef(options)
  latest.current = options
  // one LayoutDocument per component instance; it always calls the newest save/load
  const doc = useMemo(
    () => new LayoutDocument({ ...options, load: options.load && (() => latest.current.load!()), save: (layout) => latest.current.save(layout) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const state = useSyncExternalStore(doc.subscribe, () => doc.snapshot, () => doc.snapshot)
  return { value: state.value, onChange: doc.change, save: () => doc.save(), status: state.status, error: state.error }
}

export { Designer }
export type { Data, Layout, LayoutInput, PlaceholderCatalog, DesignerOptions, DocumentStatus, LayoutDocumentOptions }
