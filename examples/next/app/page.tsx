'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { Layout } from '@pdf-layouter/core'
import type { PlaceholderCatalog } from '@pdf-layouter/react'
import { catalog, fontFiles, sampleData, starterLayout } from '../../shared/demo-data.mjs'

// The Designer needs the DOM: load it on the client only.
const LayoutDesigner = dynamic(() => import('@pdf-layouter/react').then((m) => m.LayoutDesigner), { ssr: false })

export default function Page() {
  const [layout, setLayout] = useState<Layout | undefined>(undefined)
  const [status, setStatus] = useState('loading…')
  const latest = useRef<Layout | undefined>(undefined)

  // 1. load the stored layout from "the database" (an API route here)
  useEffect(() => {
    fetch('/api/layout')
      .then((r) => r.json())
      .then((stored: Layout | null) => {
        const initial = (stored ?? starterLayout) as Layout
        latest.current = initial
        setLayout(initial)
        setStatus(stored ? 'loaded' : 'new layout')
      })
  }, [])

  // 2. every edit arrives here; keep the latest JSON for saving
  const onChange = (next: Layout) => {
    latest.current = next
    setLayout(next)
    setStatus('unsaved changes')
  }

  // 3. the app's own save function writes the JSON back
  const save = async () => {
    await fetch('/api/layout', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(latest.current) })
    setStatus('saved')
  }

  const pdf = async () => {
    const res = await fetch('/api/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout: latest.current, data: sampleData }) })
    window.open(URL.createObjectURL(await res.blob()))
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd', font: '14px system-ui' }}>
        <button data-testid="save" onClick={save}>Speichern</button>
        <button data-testid="pdf" onClick={pdf}>PDF erzeugen (Server)</button>
        <span data-testid="status">{status}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {layout && <LayoutDesigner value={layout} onChange={onChange} placeholders={catalog as PlaceholderCatalog} sampleData={sampleData} fonts={fontFiles('/fonts')} />}
      </div>
    </div>
  )
}
