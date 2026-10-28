'use client'

import { defineFonts, type LayoutInput } from '@pdf-layouter/core'
import { LayoutDesigner, useLayoutDocument } from '@pdf-layouter/react'
import type { PlaceholderCatalog } from '@pdf-layouter/react'
import { catalog, fontFamilies, sampleData, starterLayout } from '../../shared/demo-data.mjs'

const fonts = defineFonts(fontFamilies).at('/fonts') // the same declaration the server uses, resolved to URLs

const labels = { loading: 'loading…', new: 'new layout', loaded: 'loaded', dirty: 'unsaved changes', saving: 'saving…', saved: 'saved', error: 'error' } as const

export default function Page() {
  // load from "the database" (an API route here), edit, and save with the app's own function
  const doc = useLayoutDocument({
    load: () => fetch('/api/layout').then((r) => r.json()),
    save: (layout) => fetch('/api/layout', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(layout) }).then(() => undefined),
    fallback: starterLayout as LayoutInput,
  })

  const pdf = async () => {
    const res = await fetch('/api/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout: doc.value, data: sampleData }) })
    window.open(URL.createObjectURL(await res.blob()))
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd', font: '14px system-ui' }}>
        <button data-testid="save" onClick={doc.save}>Speichern</button>
        <button data-testid="pdf" onClick={pdf}>PDF erzeugen (Server)</button>
        <span data-testid="status">{labels[doc.status]}</span>
        <a href="/generator" style={{ marginLeft: 'auto' }}>Beispiel: Rechnungen &amp; Serienbriefe →</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {doc.value && <LayoutDesigner value={doc.value} onChange={doc.onChange} placeholders={catalog as PlaceholderCatalog} sampleData={sampleData} fonts={fonts} />}
      </div>
    </div>
  )
}
