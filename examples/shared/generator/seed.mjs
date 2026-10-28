// Creates the example "database" (data/db.json) and the two Layouts (data/*.layout.json).
// In a real app the Layouts come out of the Designer and live in your database; they are written here as code so the example is self-contained.
// Run once with `node examples/shared/generator/seed.mjs`; the generated files are committed.
import { readFileSync, writeFileSync } from 'node:fs'

const asset = (name) => new URL(`../../../fixtures/assets/${name}`, import.meta.url)
const dataUrl = (name, type) => `data:${type};base64,${readFileSync(asset(name)).toString('base64')}`
const out = (name) => new URL(`./${name}`, import.meta.url)

// ---- database -------------------------------------------------------------------------------

const people = [
  ['Frau', 'Anna Becker', 'Lindenstraße 4', '10115', 'Berlin'],
  ['Herr', 'Jonas Krüger', 'Hafenweg 12', '20457', 'Hamburg'],
  ['Frau', 'Mia Hoffmann', 'Schlossallee 7', '80331', 'München'],
  ['Herr', 'Lukas Schäfer', 'Domplatz 3', '50667', 'Köln'],
  ['Frau', 'Emilia Wagner', 'Königstraße 21', '70173', 'Stuttgart'],
  ['Herr', 'Noah Fischer', 'Kastanienallee 9', '04109', 'Leipzig'],
  ['Frau', 'Hannah Weber', 'Rheinufer 15', '40213', 'Düsseldorf'],
  ['Herr', 'Elias Schulz', 'Bahnhofstraße 2', '60311', 'Frankfurt am Main'],
  ['Frau', 'Sophia Richter', 'Elbchaussee 88', '01067', 'Dresden'],
  ['Herr', 'Finn Neumann', 'Marktplatz 1', '90402', 'Nürnberg'],
  ['Frau', 'Lea Zimmermann', 'Wiesenweg 6', '28195', 'Bremen'],
  ['Herr', 'Paul Braun', 'Gartenstraße 30', '30159', 'Hannover'],
]
const customers = people.map(([salutation, name, street, zip, city], i) => ({ id: i + 1, salutation, name, street, zip, city }))

const services = [
  ['Beratung', 95], ['Konzeption', 110], ['Entwicklung', 120], ['Qualitätssicherung', 85], ['Projektleitung', 105],
  ['Schulung', 90], ['Wartung', 70], ['Übersetzung', 60], ['Dokumentation', 80], ['Support', 65],
]
const round2 = (n) => Math.round(n * 100) / 100
const invoices = [1, 2, 3].map((n) => {
  const items = services.map(([text, price], i) => {
    const qty = ((i + n) % 6) + 1 + ((i + n) % 2) * 0.5
    return { pos: i + 1, text: `${text} (${['Phase A', 'Phase B', 'Phase C'][n - 1]})`, qty, price, total: round2(qty * price) }
  })
  const net = round2(items.reduce((s, p) => s + p.total, 0))
  const vat = round2(net * 0.19)
  return { id: n, number: `RE-2026-${String(100 + n).padStart(4, '0')}`, customerId: n, date: `2026-10-${String(20 + n).padStart(2, '0')}`, due: `2026-11-${String(3 + n).padStart(2, '0')}`, items, net, vat, gross: round2(net + vat) }
})

writeFileSync(out('db.json'), JSON.stringify({ customers, invoices }, null, 2))

// ---- layouts --------------------------------------------------------------------------------

const page = (font, first) => ({
  size: 'A4',
  orientation: 'portrait',
  contentBox: { first: { top: first, bottom: 25, left: 20, right: 20 }, follow: { top: 25, bottom: 25, left: 20, right: 20 } },
  defaults: { font, size: 10, color: '#222222' },
})
const pagenumber = { id: 'pagenumber', type: 'text', x: 20, y: 280, w: 170, align: 'right', size: 8, color: '#666666', content: 'Seite {{page}} von {{pages}}', pages: 'all' }

const invoice = {
  schemaVersion: 1,
  locale: 'de-DE',
  currency: 'EUR',
  page: page('Inter', 95),
  assets: { logo: { data: readFileSync(asset('logo.svg'), 'utf8') } },
  static: [
    { id: 'logo', type: 'image', asset: 'logo', x: 150, y: 15, w: 45, h: 15, pages: 'all' },
    { id: 'addr', type: 'address', preset: 'DIN5008-B', returnAddress: 'Beispiel AG · Musterweg 1 · 10115 Berlin', content: '{{customer.name}}\n{{customer.street}}\n{{customer.zip}} {{customer.city}}', pages: 'first' },
    { id: 'meta', type: 'text', x: 125, y: 50, w: 65, align: 'right', content: 'Rechnung {{invoice.number}}\nDatum: {{invoice.date | date}}\nFällig am: {{invoice.due | date}}', pages: 'first' },
    { id: 'bar', type: 'rect', x: 0, y: 0, w: 210, h: 4, fill: '#1F3A5F', pages: 'notFirst' },
    pagenumber,
  ],
  flow: [
    { type: 'text', content: [{ type: 'paragraph', runs: [{ text: 'Rechnung {{invoice.number}}', bold: true, size: 14 }] }] },
    { type: 'text', content: '{{customer.salutation}} {{customer.name}},\n\nvielen Dank für Ihren Auftrag. Wir berechnen Ihnen die folgenden Leistungen.' },
    {
      type: 'table',
      source: 'items',
      columns: [
        { field: 'pos', title: 'Pos', width: 12, align: 'right', format: 'number' },
        { field: 'text', title: 'Leistung', width: '*' },
        { field: 'qty', title: 'Menge', width: 18, align: 'right', format: 'number:2' },
        { field: 'price', title: 'Einzel', width: 24, align: 'right', format: 'currency' },
        { field: 'total', title: 'Gesamt', width: 28, align: 'right', format: 'currency' },
      ],
      style: { headerFill: '#EEEEEE', zebra: true },
    },
    { type: 'totals', rows: [{ label: 'Netto', value: '{{invoice.net | currency}}' }, { label: 'USt 19 %', value: '{{invoice.vat | currency}}' }, { label: 'Gesamt', value: '{{invoice.gross | currency}}', bold: true }] },
    { type: 'text', content: 'Bitte überweisen Sie den Betrag bis zum {{invoice.due | date:long}}.' },
  ],
}

const lorem = [
  'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum.',
  'Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis.',
]
const letter = {
  schemaVersion: 1,
  locale: 'de-DE',
  currency: 'EUR',
  page: page('Merriweather', 100),
  assets: {
    paper: { data: dataUrl('briefpapier.jpg', 'image/jpeg'), w: 827, h: 1169 },
    logo: { data: readFileSync(asset('logo.svg'), 'utf8') },
    seal: { data: dataUrl('logo.png', 'image/png'), w: 300, h: 100 },
  },
  static: [
    { id: 'paper', type: 'image', asset: 'paper', x: 0, y: 0, w: 210, h: 297, pages: 'first' },
    { id: 'logo', type: 'image', asset: 'logo', x: 150, y: 12, w: 45, h: 15, pages: 'first' },
    { id: 'addr', type: 'address', preset: 'DIN5008-A', returnAddress: 'Beispiel AG · Musterweg 1 · 10115 Berlin', content: '{{recipient.name}}\n{{recipient.street}}\n{{recipient.zip}} {{recipient.city}}', pages: 'first' },
    { id: 'date', type: 'text', x: 140, y: 80, w: 50, align: 'right', content: '{{letter.date | date:long}}', pages: 'first' },
    { id: 'seal', type: 'image', asset: 'seal', x: 20, y: 248, w: 36, h: 12, pages: 'last' },
    pagenumber,
  ],
  flow: [
    { type: 'text', content: [{ type: 'paragraph', runs: [{ text: '{{letter.subject}}', bold: true, size: 12 }] }] },
    { type: 'text', content: [{ type: 'paragraph', runs: [{ text: '{{recipient.salutation}} {{recipient.name}},' }] }, { type: 'paragraph', runs: [{ text: lorem[0] }] }] },
    { type: 'text', content: [{ type: 'paragraph', runs: [{ text: lorem[1] }] }, { type: 'list', ordered: false, items: [[{ text: 'Lorem ipsum dolor sit amet' }], [{ text: 'Consetetur sadipscing elitr' }], [{ text: 'Sed diam nonumy eirmod tempor' }]] }] },
    { type: 'text', content: [{ type: 'paragraph', runs: [{ text: lorem[0] }] }, { type: 'paragraph', runs: [{ text: 'Mit freundlichen Grüßen' }] }, { type: 'paragraph', runs: [{ text: 'Max Mustermann', bold: true }] }] },
  ],
}

writeFileSync(out('invoice.layout.json'), JSON.stringify(invoice))
writeFileSync(out('letter.layout.json'), JSON.stringify(letter))
console.log(`db.json: ${customers.length} customers, ${invoices.length} invoices · layouts written`)
