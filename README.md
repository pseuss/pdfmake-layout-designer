# pdf-layouter

A small, embeddable layout designer and PDF generator built on [pdfmake](https://pdfmake.github.io/docs/).
Users design a layout visually; your app stores **one JSON per layout**; later the JSON plus your data becomes a PDF.
MIT licensed. Works in React, Next, Vue, Nuxt, or plain TypeScript.

| Package | What it is |
| --- | --- |
| `@pdf-layouter/core` | Schema + validation, placeholder resolver, compiler (layout JSON → pdfmake), `generate()` / `generateBatch()`. Runs in browser **and** Node, no UI dependencies. |
| `@pdf-layouter/designer` | The visual editor in vanilla TypeScript: `new Designer({ container, … })`. |
| `@pdf-layouter/react` | `<LayoutDesigner />` wrapper (~60 lines). |
| `@pdf-layouter/vue` | `<LayoutDesigner />` wrapper for Vue 3 / Nuxt (~70 lines). |

Scope: the library only. Storage, tenants, permissions, data retrieval, calculations and ZUGFeRD XML belong to the host app
(see `docs/adr/0003-library-does-not-calculate.md`). Domain vocabulary is in [`GLOSSARY.md`](GLOSSARY.md), decisions in [`docs/adr`](docs/adr).

## Generate a PDF

```ts
import { generate, generateBatch } from '@pdf-layouter/core'

// Use case 1: one document (invoice, quote)
const pdf: Uint8Array = await generate(layout, data, { fonts: fontRegistry })

// Use case 2: form letters – one PDF, one page (or more) per record
const letters: Uint8Array = await generateBatch(layout, records, { fonts: fontRegistry, onePagePerRecord: true })
```

Options: `fonts`, `pdfa` (`'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'`), `attachments` (e.g. a ZUGFeRD XML that your app creates),
`onWarning`, `info`. `onePagePerRecord` throws `RecordOverflowError` when a letter needs more than one page (`overflow: 'warn'` only warns).
`toDocDefinition(layout, data)` returns the raw pdfmake document definition as an escape hatch.

The library is stateless: a layout JSON is a layout. Invalid or newer JSON is rejected with a readable `LayoutError`; older versions are migrated.

## Embed the Designer

```ts
import { Designer } from '@pdf-layouter/designer'

const designer = new Designer({
  container: document.getElementById('designer')!,
  layout: savedLayoutJson,          // optional, empty A4 layout otherwise
  placeholders: placeholderCatalog, // from your app
  sampleData,                       // for canvas and live preview
  fonts: fontRegistry,              // from your app (URLs in the browser)
  locale: 'de',                     // 'de' | 'en'
  onChange: (layout) => save(layout),
})
designer.getLayout()   // self-contained JSON (unused images removed)
designer.setLayout(json)
designer.setSampleData(data)
designer.addImage(file)            // optimised and added as an image element
designer.getWarnings()             // missing placeholders, big images, …
designer.destroy()
```

**React / Next** (client only):

```tsx
import { LayoutDesigner } from '@pdf-layouter/react'
<LayoutDesigner value={layout} onChange={setLayout} placeholders={catalog} sampleData={sample} fonts={fonts} />
// Next: const LayoutDesigner = dynamic(() => import('@pdf-layouter/react').then(m => m.LayoutDesigner), { ssr: false })
```

**Vue / Nuxt** (client only):

```vue
<ClientOnly>
  <LayoutDesigner v-model="layout" :placeholders="catalog" :sample-data="sample" :fonts="fonts" />
</ClientOnly>
```

`@pdf-layouter/core` also works on the server (Nitro, Next API routes). The UI packages can be imported during SSR; they only touch the DOM when a Designer is created.

## Layout JSON

A layout has two layers (ADR 0001): a **static layer** of freely positioned elements and a **flow layer** that flows and breaks across pages.
All lengths are millimetres.

```jsonc
{
  "schemaVersion": 1, "locale": "de-DE", "currency": "EUR",
  "page": {
    "size": "A4", "orientation": "portrait",
    "contentBox": { "first": { "top": 95, "bottom": 30, "left": 25, "right": 20 }, "follow": { "top": 30, "bottom": 30, "left": 25, "right": 20 } },
    "defaults": { "font": "Inter", "size": 10, "color": "#222222" },
    "footer": { "content": "Seite {{page}} von {{pages}}", "align": "right" }
  },
  "assets": { "img_logo": { "data": "data:image/png;base64,…", "w": 600, "h": 200 } },
  "static": [
    { "id": "bg", "type": "image", "asset": "img_bg", "x": 0, "y": 0, "w": 210, "h": 297, "pages": "first" },
    { "id": "bar", "type": "rect", "x": 0, "y": 0, "w": 210, "h": 12, "fill": "#1F3A5F", "pages": "notFirst" },
    { "id": "sep", "type": "line", "x1": 25, "y1": 90, "x2": 190, "y2": 90, "width": 0.5, "color": "#999999", "dash": "solid" },
    { "id": "addr", "type": "address", "preset": "DIN5008-B", "content": "{{kunde.name}}\n{{kunde.strasse}}" },
    { "id": "meta", "type": "text", "x": 125, "y": 50, "w": 65, "align": "right", "content": "Datum: {{rechnung.datum | date}}" }
  ],
  "flow": [
    { "type": "text", "content": [{ "text": "{{baustein.einleitung}}" }] },
    { "type": "table", "source": "positionen", "columns": [{ "field": "gesamt", "title": "Gesamt", "width": 28, "align": "right", "format": "currency" }], "style": { "headerFill": "#EEEEEE", "zebra": true } },
    { "type": "totals", "rows": [{ "label": "Gesamt", "value": "{{summen.brutto | currency}}", "bold": true }] },
    { "type": "dynamicSections", "source": "abschnitte" },
    { "type": "pageBreak" }
  ]
}
```

* **Page rules** (`pages`): `all`, `first`, `notFirst`, `last`. In a batch, "first" and "last" refer to each record's own pages.
* **Images** live once in `assets` (Base64 data URL or inline `<svg>`); elements reference them by id. The Designer downsizes to 2480 px, uses JPEG for photos, keeps PNG for transparency, keeps SVG as text and warns above 1.5 MB (`images` option).
* **Text blocks** accept a string, a run array `[{ text, bold, italic, underline }]` or blocks (paragraphs, lists).
* **Dynamic sections**: your app passes an ordered list such as `[{ "type": "text", "content": "…" }, { "type": "table", "columns": […], "rows": […] }]`; the layout only supplies styling.
* **Content box**: pdfmake has one margin set per document. Left/right margins use the page-1 values, the extra top space of page 1 is a spacer, bottom margins use the larger value; the Designer and the compiler warn when a layout cannot be represented exactly.

## Placeholders

`{{kunde.name}}`, `{{rechnung.datum | date}}`, `{{betrag | currency}}`, `{{menge | number:2}}`, `{{x | currency:USD}}`, `{{d | date:long}}`.
Plain dotted-path lookup – no `eval`, no inherited properties, substituted values are never re-scanned. Missing values stay empty and trigger a warning.
Formatting uses `Intl` with the layout's `locale` and `currency`. The library **never calculates**: sums and taxes come finished from your app.

Your app hands the Designer a catalog:

```ts
const placeholderCatalog = {
  groups: [{ key: 'kunde', label: 'Kunde', fields: [{ key: 'name', label: 'Name' }] }],
  lists: [{ key: 'positionen', label: 'Positionen', fields: [{ key: 'gesamt', label: 'Gesamt', type: 'currency' }] }],
}
```

## Fonts

Your app serves the font files (TTF/OTF, e.g. from Google Fonts, OFL) and passes a registry. The layout stores only the family name.

```ts
const fontRegistry = [
  { family: 'Inter', files: { normal: '/fonts/Inter-Regular.ttf', bold: '/fonts/Inter-Bold.ttf', italics: '/fonts/Inter-Italic.ttf', bolditalics: '/fonts/Inter-BoldItalic.ttf' } },
]
```

URLs in the browser, file paths in Node. Missing styles fall back to the regular file; an unknown family falls back to the bundled **Roboto** (with a warning).
The Designer loads the same files through the `FontFace` API so canvas and PDF match.

## Development

```bash
pnpm install
pnpm fixtures      # regenerate image fixtures (fonts in fixtures/fonts are Google Fonts, OFL)
pnpm check         # typecheck, build, unit tests, built-package smoke test, Playwright e2e
pnpm dev           # demo app with all fixtures: http://localhost:5199
```

Requirements coverage: [`docs/coverage.md`](docs/coverage.md). Specification: [`docs/spec.md`](docs/spec.md).

## Known limits

Undo/redo, snapping guides, multi-select and `visibleWhen` are phase 2. The rich-text editor edits bold, italic, underline and lists; run colour/size and paragraph alignment set in JSON are preserved until the block is edited in the Designer.
