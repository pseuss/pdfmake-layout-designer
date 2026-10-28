// Placeholder catalog, sample data, font registry and a starter layout used by the Next and Nuxt examples.
export const catalog = {
  groups: [
    { key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }, { key: 'strasse', label: 'Straße' }, { key: 'ort', label: 'Ort' }] },
    { key: 'rechnung', label: 'Rechnung', fields: [{ key: 'nummer', label: 'Nummer' }, { key: 'datum', label: 'Datum', type: 'date' }] },
    { key: 'summen', label: 'Summen', fields: [{ key: 'brutto', label: 'Brutto', type: 'currency' }] },
  ],
  lists: [{ key: 'positionen', label: 'Positionen', fields: [{ key: 'beschreibung', label: 'Leistung' }, { key: 'menge', label: 'Menge', type: 'number' }, { key: 'gesamt', label: 'Gesamt', type: 'currency' }] }],
}

export const sampleData = {
  kunde: { name: 'Muster GmbH', strasse: 'Hauptstraße 12', ort: '80331 München' },
  rechnung: { nummer: 'RE-2026-0042', datum: '2026-10-28' },
  summen: { brutto: 1190 },
  positionen: [
    { beschreibung: 'Beratung', menge: 4, gesamt: 400 },
    { beschreibung: 'Entwicklung', menge: 10, gesamt: 790 },
  ],
}

export const fontFiles = (base) => [
  { family: 'Inter', files: { normal: `${base}/Inter-Regular.ttf`, bold: `${base}/Inter-Bold.ttf`, italics: `${base}/Inter-Italic.ttf`, bolditalics: `${base}/Inter-BoldItalic.ttf` } },
  { family: 'Merriweather', files: { normal: `${base}/Merriweather-Regular.ttf`, bold: `${base}/Merriweather-Bold.ttf` } },
]

export const starterLayout = {
  schemaVersion: 1,
  page: { defaults: { font: 'Inter', size: 10, color: '#222222' }, footer: { content: 'Seite {{page}} von {{pages}}' } },
  static: [
    { id: 'addr', type: 'address', preset: 'DIN5008-B', content: '{{kunde.name}}\n{{kunde.strasse}}\n{{kunde.ort}}' },
    { id: 'meta', type: 'text', x: 125, y: 50, w: 65, align: 'right', content: 'Rechnung {{rechnung.nummer}}\nDatum: {{rechnung.datum | date}}' },
  ],
  flow: [
    { type: 'text', content: 'Sehr geehrte Damen und Herren,\n\nwir berechnen Ihnen folgende Leistungen.' },
    { type: 'table', source: 'positionen', columns: [{ field: 'beschreibung', title: 'Leistung', width: '*' }, { field: 'menge', title: 'Menge', width: 20, align: 'right', format: 'number' }, { field: 'gesamt', title: 'Gesamt', width: 30, align: 'right', format: 'currency' }], style: { headerFill: '#EEEEEE' } },
    { type: 'totals', rows: [{ label: 'Gesamt', value: '{{summen.brutto | currency}}', bold: true }] },
  ],
}
