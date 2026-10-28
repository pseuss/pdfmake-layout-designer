// Pure test data builders (no Node APIs), shared by unit tests, e2e tests and the demo page.
import type { Data, LayoutInput } from '@pdf-layouter/core'

export interface FixtureAssets {
  background: string // data URL (JPEG)
  logo: string // data URL (PNG)
  logoSvg: string // <svg ...>
}

const SERVICES = ['Beratung', 'Konzeption', 'Entwicklung', 'Qualitätssicherung', 'Projektleitung', 'Schulung', 'Wartung', 'Übersetzung', 'Reisezeit', 'Dokumentation']

export function invoiceData(positionCount = 70): Data {
  const positionen = Array.from({ length: positionCount }, (_, i) => {
    const menge = (i % 7) + 1 + (i % 2) * 0.5
    const preis = 45 + (i % 9) * 7.5
    return { pos: i + 1, beschreibung: `${SERVICES[i % SERVICES.length]} Modul ${i + 1} (äöü ß)`, menge, einzel: preis, gesamt: Math.round(menge * preis * 100) / 100 }
  })
  const netto = Math.round(positionen.reduce((s, p) => s + p.gesamt, 0) * 100) / 100
  const ust19 = Math.round(netto * 0.19 * 100) / 100
  return {
    kunde: { name: 'Muster GmbH', zusatz: 'z. Hd. Frau Beispiel', strasse: 'Hauptstraße 12', plz: '80331', ort: 'München' },
    rechnung: { nummer: 'RE-2026-0042', datum: '2026-10-28', faellig: '2026-11-11' },
    baustein: {
      einleitung: 'vielen Dank für Ihren Auftrag. Wir berechnen Ihnen die folgenden Leistungen.',
      schluss: 'Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.',
    },
    positionen,
    reisekosten: [
      { beschreibung: 'Bahnfahrt München – Berlin', gesamt: 189.9 },
      { beschreibung: 'Hotel (2 Nächte)', gesamt: 264 },
    ],
    summen: { netto, ust19, brutto: Math.round((netto + ust19) * 100) / 100 },
    abschnitte: [
      { type: 'text', content: 'Leistungszeitraum Oktober 2026' },
      { type: 'table', columns: [{ field: 'was', title: 'Leistung', width: '*' }, { field: 'betrag', title: 'Betrag', width: 28, align: 'right', format: 'currency' }], rows: [{ was: 'Grundpauschale', betrag: 1200 }, { was: 'Zusatzaufwand', betrag: 350.5 }] },
      { type: 'text', content: [{ text: 'Zusätzlich angefallene ', bold: false }, { text: 'Reisekosten', bold: true }, { text: ':' }] },
      { type: 'table', columns: [{ field: 'was', title: 'Posten', width: '*' }, { field: 'betrag', title: 'Betrag', width: 28, align: 'right', format: 'currency' }], rows: [{ was: 'Bahn', betrag: 189.9 }, { was: 'Hotel', betrag: 264 }] },
    ],
  }
}

export function invoiceLayout(assets: FixtureAssets, overrides: Partial<LayoutInput> = {}): LayoutInput {
  return {
    schemaVersion: 1,
    locale: 'de-DE',
    currency: 'EUR',
    page: {
      size: 'A4',
      orientation: 'portrait',
      contentBox: {
        first: { top: 95, bottom: 30, left: 25, right: 20 },
        follow: { top: 30, bottom: 30, left: 25, right: 20 },
      },
      defaults: { font: 'Inter', size: 10, color: '#222222' },
      footer: { content: 'Seite {{page}} von {{pages}}', align: 'right' },
    },
    assets: {
      img_bg: { data: assets.background, w: 827, h: 1169 },
      img_logo: { data: assets.logo, w: 300, h: 100 },
    },
    static: [
      { id: 'bg', type: 'image', asset: 'img_bg', x: 0, y: 0, w: 210, h: 297, pages: 'first' },
      { id: 'logo', type: 'image', asset: 'img_logo', x: 150, y: 15, w: 45, h: 15, pages: 'all' },
      { id: 'bar', type: 'rect', x: 0, y: 0, w: 210, h: 4, fill: '#1F3A5F', pages: 'notFirst' },
      { id: 'sep', type: 'line', x1: 25, y1: 90, x2: 190, y2: 90, width: 0.5, color: '#999999', dash: 'solid', pages: 'first' },
      { id: 'addr', type: 'address', preset: 'DIN5008-B', returnAddress: 'Beispiel AG · Musterweg 1 · 10115 Berlin', content: '{{kunde.name}}\n{{kunde.strasse}}\n{{kunde.plz}} {{kunde.ort}}', pages: 'first' },
      { id: 'meta', type: 'text', x: 125, y: 50, w: 65, align: 'right', content: 'Rechnung {{rechnung.nummer}}\nDatum: {{rechnung.datum | date}}', pages: 'first' },
      { id: 'end', type: 'text', x: 25, y: 280, w: 100, content: 'Vielen Dank für Ihr Vertrauen!', size: 8, pages: 'last' },
    ],
    flow: [
      { type: 'text', content: [{ text: 'Sehr geehrte Damen und Herren,' }] },
      { type: 'text', content: '{{baustein.einleitung}}' },
      {
        type: 'table',
        source: 'positionen',
        columns: [
          { field: 'pos', title: 'Pos', width: 12, align: 'right', format: 'number' },
          { field: 'beschreibung', title: 'Leistung', width: '*' },
          { field: 'menge', title: 'Menge', width: 18, align: 'right', format: 'number:2' },
          { field: 'einzel', title: 'Einzel', width: 24, align: 'right', format: 'currency' },
          { field: 'gesamt', title: 'Gesamt', width: 28, align: 'right', format: 'currency' },
        ],
        style: { headerFill: '#EEEEEE', zebra: true },
      },
      { type: 'text', content: 'Zusätzliche Reisekosten:' },
      {
        type: 'table',
        source: 'reisekosten',
        columns: [
          { field: 'beschreibung', title: 'Posten', width: '*' },
          { field: 'gesamt', title: 'Gesamt', width: 28, align: 'right', format: 'currency' },
        ],
        style: { headerFill: '#EEEEEE' },
      },
      {
        type: 'totals',
        rows: [
          { label: 'Netto', value: '{{summen.netto | currency}}' },
          { label: 'USt 19 %', value: '{{summen.ust19 | currency}}' },
          { label: 'Gesamt', value: '{{summen.brutto | currency}}', bold: true },
        ],
      },
      { type: 'dynamicSections', source: 'abschnitte', styles: { table: { headerFill: '#EEEEEE' }, text: { margin: [0, 6, 0, 6] } } },
      { type: 'text', content: '{{baustein.schluss}}' },
    ],
    ...overrides,
  }
}

export function serialRecords(count = 25): Data[] {
  const cities = [['80331', 'München'], ['10115', 'Berlin'], ['20095', 'Hamburg'], ['50667', 'Köln'], ['70173', 'Stuttgart']]
  return Array.from({ length: count }, (_, i) => {
    const [plz, ort] = cities[i % cities.length]!
    return {
      empfaenger: { anrede: i % 2 ? 'Sehr geehrter Herr' : 'Sehr geehrte Frau', name: `Nummer ${String(i + 1).padStart(2, '0')} Müller`, strasse: `Gartenweg ${i + 1}`, plz, ort },
      brief: { datum: '2026-10-28', betreff: `Einladung Nr. ${i + 1}` },
    }
  })
}

export function serialLayout(assets: FixtureAssets): LayoutInput {
  return {
    schemaVersion: 1,
    locale: 'de-DE',
    currency: 'EUR',
    page: {
      size: 'A4',
      orientation: 'portrait',
      contentBox: { first: { top: 100, bottom: 25, left: 25, right: 20 }, follow: { top: 25, bottom: 25, left: 25, right: 20 } },
      defaults: { font: 'Merriweather', size: 10, color: '#222222' },
    },
    assets: { img_logo: { data: assets.logoSvg } },
    static: [
      { id: 'logo', type: 'image', asset: 'img_logo', x: 150, y: 12, w: 45, h: 15, pages: 'first' },
      { id: 'addr', type: 'address', preset: 'DIN5008-A', content: '{{empfaenger.name}}\n{{empfaenger.strasse}}\n{{empfaenger.plz}} {{empfaenger.ort}}', pages: 'first' },
      { id: 'date', type: 'text', x: 140, y: 80, w: 50, align: 'right', content: '{{brief.datum | date:long}}', pages: 'first' },
    ],
    flow: [
      { type: 'text', content: [{ text: '{{brief.betreff}}', bold: true }] },
      { type: 'text', content: '{{empfaenger.anrede}} {{empfaenger.name}},\n\nwir laden Sie herzlich zu unserer Veranstaltung ein.' },
    ],
  }
}

/** The placeholder catalog a Host App would hand to the Designer (matches `invoiceData`). */
export const placeholderCatalog = {
  groups: [
    { key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }, { key: 'zusatz', label: 'Zusatz' }, { key: 'strasse', label: 'Straße' }, { key: 'plz', label: 'PLZ' }, { key: 'ort', label: 'Ort' }] },
    { key: 'rechnung', label: 'Rechnung', fields: [{ key: 'nummer', label: 'Rechnungsnummer' }, { key: 'datum', label: 'Datum', type: 'date' as const }, { key: 'faellig', label: 'Fällig am', type: 'date' as const }] },
    { key: 'summen', label: 'Summen', fields: [{ key: 'netto', label: 'Netto', type: 'currency' as const }, { key: 'ust19', label: 'USt 19 %', type: 'currency' as const }, { key: 'brutto', label: 'Brutto', type: 'currency' as const }] },
    { key: 'baustein', label: 'Textbausteine', fields: [{ key: 'einleitung', label: 'Einleitung' }, { key: 'schluss', label: 'Schluss' }] },
  ],
  lists: [
    { key: 'positionen', label: 'Positionen', fields: [{ key: 'pos', label: 'Pos', type: 'number' as const }, { key: 'beschreibung', label: 'Leistung' }, { key: 'menge', label: 'Menge', type: 'number' as const }, { key: 'einzel', label: 'Einzelpreis', type: 'currency' as const }, { key: 'gesamt', label: 'Gesamt', type: 'currency' as const }] },
    { key: 'reisekosten', label: 'Reisekosten', fields: [{ key: 'beschreibung', label: 'Posten' }, { key: 'gesamt', label: 'Gesamt', type: 'currency' as const }] },
  ],
}

/** Font registry with URLs, as used in the browser (files are served from /fonts). */
export function browserFontRegistry(base = '/fonts') {
  const f = (name: string) => `${base}/${name}.ttf`
  return [
    { family: 'Inter', files: { normal: f('Inter-Regular'), bold: f('Inter-Bold'), italics: f('Inter-Italic'), bolditalics: f('Inter-BoldItalic') } },
    { family: 'Merriweather', files: { normal: f('Merriweather-Regular'), bold: f('Merriweather-Bold'), italics: f('Merriweather-Italic'), bolditalics: f('Merriweather-BoldItalic') } },
  ]
}
