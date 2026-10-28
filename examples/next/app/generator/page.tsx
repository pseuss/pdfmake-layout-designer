'use client'

import { useEffect, useState } from 'react'

interface Customer { id: number; name: string; zip: string; city: string }
interface Invoice { id: number; number: string; customerId: number; gross: number }

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/** Data from "the database" (API routes), PDFs generated on the server. */
export default function GeneratorPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [pdfUrl, setPdfUrl] = useState<string>()
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/generator/invoices').then((r) => r.json()).then(setInvoices)
    fetch('/api/generator/customers').then((r) => r.json()).then((rows: Customer[]) => {
      setCustomers(rows)
      setSelected(rows.map((c) => c.id))
    })
  }, [])

  const show = async (url: string) => {
    setStatus('Erzeuge PDF …')
    const started = performance.now()
    const res = await fetch(url)
    if (!res.ok) return setStatus(`Fehler: ${(await res.json()).error}`)
    const blob = await res.blob()
    setPdfUrl(URL.createObjectURL(blob))
    setStatus(`${Math.round(blob.size / 1024)} KB in ${Math.round(performance.now() - started)} ms`)
  }
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 460px) 1fr', gap: 16, padding: 16, height: '100vh', boxSizing: 'border-box', font: '14px system-ui' }}>
      <section style={{ overflow: 'auto' }}>
        <p><a href="/">← Designer</a></p>
        <h1 style={{ fontSize: 18 }}>Generator</h1>

        <h2 style={{ fontSize: 14 }}>1 · Rechnungen</h2>
        <table style={{ width: '100%' }} data-testid="invoices">
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number}</td>
                <td>{customers.find((c) => c.id === i.customerId)?.name}</td>
                <td style={{ textAlign: 'right' }}>{euro.format(i.gross)}</td>
                <td><button data-testid={`invoice-${i.id}`} onClick={() => show(`/api/generator/invoices/${i.id}/pdf`)}>PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><button data-testid="all-invoices" onClick={() => show('/api/generator/invoices/pdf')}>Alle Rechnungen als ein PDF</button></p>

        <h2 style={{ fontSize: 14 }}>2 · Serienbriefe</h2>
        <table style={{ width: '100%' }} data-testid="customers">
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                <td>{c.name}</td>
                <td>{c.zip} {c.city}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button data-testid="letters" onClick={() => show(`/api/generator/letters/pdf?ids=${selected.join(',')}`)}>Serienbriefe erzeugen</button>{' '}
          <span data-testid="status">{status}</span>
        </p>
      </section>
      <iframe title="PDF" src={pdfUrl} data-testid="preview" style={{ width: '100%', height: '100%', border: '1px solid #ddd' }} />
    </div>
  )
}
