// Browser variant of the generator example: the same "database" rows and stored Layouts, but the PDFs are generated in the page.
import { generate, generateBatch } from '@pdf-layouter/core'
import db from '../shared/generator/db.json'
import invoiceLayout from '../shared/generator/invoice.layout.json'
import letterLayout from '../shared/generator/letter.layout.json'
import { invoiceRecord, letterRecord } from '../shared/generator/records.mjs'
import { browserFontRegistry } from '../../fixtures/data'

const fonts = browserFontRegistry('/fonts') // URLs in the browser
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!

async function show(make: () => Promise<Uint8Array>) {
  $('#status').textContent = 'Erzeuge PDF …'
  const started = performance.now()
  const bytes = await make()
  $<HTMLIFrameElement>('#preview').src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  $('#status').textContent = `${Math.round(bytes.byteLength / 1024)} KB in ${Math.round(performance.now() - started)} ms`
}

for (const invoice of db.invoices) {
  const customer = db.customers.find((c) => c.id === invoice.customerId)!
  const row = document.createElement('tr')
  row.innerHTML = `<td>${invoice.number}</td><td>${customer.name}</td><td class="num">${euro.format(invoice.gross)}</td><td><button data-testid="invoice-${invoice.id}">PDF</button></td>`
  row.querySelector('button')!.onclick = () => show(() => generate(invoiceLayout, invoiceRecord(invoice, db.customers), { fonts }))
  $('#invoices tbody').append(row)
}
for (const customer of db.customers) {
  const row = document.createElement('tr')
  row.innerHTML = `<td><input type="checkbox" value="${customer.id}" checked></td><td>${customer.name}</td><td>${customer.zip} ${customer.city}</td>`
  $('#customers tbody').append(row)
}

$('#all-invoices').onclick = () => show(() => generateBatch(invoiceLayout, db.invoices.map((i) => invoiceRecord(i, db.customers)), { fonts }))
$('#letters').onclick = () => {
  const ids = [...document.querySelectorAll<HTMLInputElement>('#customers input:checked')].map((i) => Number(i.value))
  const date = new Date().toISOString().slice(0, 10)
  return show(() => generateBatch(letterLayout, db.customers.filter((c) => ids.includes(c.id)).map((c) => letterRecord(c, date)), { fonts }))
}
document.documentElement.dataset.ready = 'true'
