# pdfmake-layout-designer

A small, embeddable layout designer and PDF generator built on [pdfmake](https://pdfmake.github.io/docs/).
Users design a layout visually; your app stores **one JSON per layout**; later the JSON plus your data becomes a PDF.
Made for invoices, quotes and form letters (DIN 5008 address windows, stationery, tables that break across pages). MIT licensed.
Works in React, Next, Vue, Nuxt, or plain TypeScript.

> **Not affiliated with pdfmake.** This is an independent open-source project that uses the excellent [pdfmake](https://pdfmake.github.io/docs/) library to render PDFs. "pdfmake" is named only to say what the project builds on.

```bash
npm install pdfmake-layout-designer-core    # generate PDFs (Node and browser)
npm install pdfmake-layout-designer         # visual editor, plain TypeScript
npm install pdfmake-layout-designer-react   # or pdfmake-layout-designer-vue
```

| Package | What it is |
| --- | --- |
| `pdfmake-layout-designer-core` | Schema + validation, placeholder resolver, compiler (layout JSON → pdfmake), `generate()` / `generateBatch()`. Runs in browser **and** Node, no UI dependencies. |
| `pdfmake-layout-designer` | The visual editor in vanilla TypeScript: `new Designer({ container, … })`. |
| `pdfmake-layout-designer-react` | `<LayoutDesigner />` for React and Next, plus `useLayoutDocument` and the Next config adapter. |
| `pdfmake-layout-designer-vue` | `<LayoutDesigner />` for Vue 3 and Nuxt, plus `useLayoutDocument` and the Nuxt module. |

Scope: the library only. Storage, tenants, permissions, data retrieval, calculations and ZUGFeRD XML belong to your app.
The library never calculates: sums and taxes come finished from your data.

## Generate a PDF

```ts
import { generate, generateBatch } from 'pdfmake-layout-designer-core'

// Use case 1: one document (invoice, quote)
const pdf: Uint8Array = await generate(layout, data, { fonts: fontRegistry })

// Use case 2: form letters – one PDF, one page (or more) per record
const letters: Uint8Array = await generateBatch(layout, records, { fonts: fontRegistry, onePagePerRecord: true })
```

Options: `strategy` (batch only: `'merge'` renders each record separately and joins them with the optional peer dependency `pdf-lib`), `fonts`, `pdfa` (`'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'`), `attachments` (e.g. a ZUGFeRD XML that your app creates),
`onWarning`, `info`. `onePagePerRecord` throws `RecordOverflowError` when a letter needs more than one page (`overflow: 'warn'` only warns).
`toDocDefinition(layout, data)` returns the raw pdfmake document definition as an escape hatch.

The library is stateless: a layout JSON is a layout. Invalid or newer JSON is rejected with a readable `LayoutError`; older versions are migrated.

## Embed the Designer

```ts
import { Designer } from 'pdfmake-layout-designer'

const designer = new Designer({
  container: document.getElementById('designer')!,
  layout: savedLayoutJson,          // optional, empty A4 layout otherwise
  placeholders: placeholderCatalog, // from your app
  sampleData,                       // for canvas and live preview
  fonts: fontRegistry,              // from your app (URLs in the browser)
  locale: 'de',                     // 'de' | 'en'
  theme: 'auto',                    // 'light' | 'dark' | 'auto'
  primaryColor: '#0d9488',          // optional: matches the Designer to your app
  grid: 2.5,                        // grid/snap step in mm (default 2.5; the toolbar offers 1, 2.5, 5, 10)
  onChange: (layout) => save(layout),
})
designer.getLayout()   // self-contained JSON (unused images removed)
designer.setLayout(json)
designer.setSampleData(data)
designer.addImage(file)            // optimised and added as an image element
designer.getWarnings()             // missing placeholders, big images, …
designer.destroy()
```

**React / Next:**

```tsx
import { LayoutDesigner } from 'pdfmake-layout-designer-react'
<LayoutDesigner value={layout} onChange={setLayout} placeholders={catalog} sampleData={sample} fonts={fonts} />
```

**Vue / Nuxt:**

```vue
<LayoutDesigner v-model="layout" :placeholders="catalog" :sample-data="sample" :fonts="fonts" />
```

Both wrappers render an empty frame on the server and create the Designer after mount, so no `dynamic(..., { ssr: false })` or `<ClientOnly>` is needed. The React build is a Client Component module (`"use client"`). `value` / `v-model` is compared **by content**: passing a fresh copy of the same JSON on every render does not reset the Designer or its undo history.

### Server setup (Next and Nuxt)

`generate()` runs in route handlers and server routes. pdfmake has to stay out of the server bundle; one line does that:

```js
// next.config.mjs
import { withLayoutDesigner } from 'pdfmake-layout-designer-react/next'
export default withLayoutDesigner({ /* your config */ })
```

```ts
// nuxt.config.ts: also auto-imports <LayoutDesigner>
export default defineNuxtConfig({ modules: ['pdfmake-layout-designer-vue/nuxt'] })
```

Return the PDF from a route with `pdfResponse(bytes, { filename })` (a standard `Response`, works in Next route handlers, Nitro, Hono, Bun, Deno).

## Theming: light, dark and your primary colour

The default is a plain, neutral design (white buttons, thin borders). Two options adapt it to your app:

```ts
new Designer({ container, theme: 'auto', primaryColor: '#0d9488' })   // also props on <LayoutDesigner>
designer.setTheme('dark')           // 'light' | 'dark' | 'auto' – at any time
designer.setPrimaryColor('#7c3aed') // hex; undefined restores the default
```

* `theme: 'auto'` (default) follows your page: `<html class="dark">` / `class="light"`, `data-theme` or `data-bs-theme` on `<html>`, otherwise the operating system. It reacts live to changes.
* `primaryColor` drives selection outlines, handles, the content box, active tabs and pressed buttons; text on it switches between white and near-black for contrast. The paper on the canvas stays white in dark mode.
* Everything else is a CSS custom property on `.pld-root` (`--pld-bg`, `--pld-surface`, `--pld-border`, `--pld-text`, `--pld-radius`, `--pld-font`, …) that you can override in your own CSS.
* The styles are written with Tailwind CSS v4 at build time and ship as plain scoped CSS: your app needs no Tailwind and no CSS import.

## Load and save (the usual Nuxt / Next flow)

The library is stateless and has no storage. Your app loads the JSON, hands it to the Designer, and saves what comes back. `useLayoutDocument` does the bookkeeping (loading, unsaved changes, saving, errors); *where* the JSON lives is up to your `load` and `save` functions:

```tsx
// React / Next
const doc = useLayoutDocument({
  load: () => fetch('/api/layout').then((r) => r.json()),          // null: nothing stored yet
  save: (layout) => fetch('/api/layout', { method: 'PUT', body: JSON.stringify(layout) }).then(() => {}),
  fallback: starterLayout,                                          // used when nothing is stored
})
<LayoutDesigner value={doc.value} onChange={doc.onChange} />
<button onClick={doc.save}>Save</button> {doc.status}              // loading | new | loaded | dirty | saving | saved | error
```

```vue
<script setup lang="ts">
// Vue / Nuxt: load during SSR, then edit and save
const { data: stored } = await useFetch('/api/layout')
const { layout, status, save } = useLayoutDocument({ initial: stored.value, fallback: starterLayout, save: (l) => $fetch('/api/layout', { method: 'PUT', body: l }) })
</script>
<template><LayoutDesigner v-model="layout" /><button @click="save">Save</button> {{ status }}</template>
```

The same workflow without a framework is the `LayoutDocument` class (`pdfmake-layout-designer`): `change` is the Designer's `onChange`, `save()` calls your function, `subscribe` tells you about status changes. An edit made while the stored layout is still loading is never overwritten by it.

* `onChange(layout)` (React) / `v-model` (Vue) / `new Designer({ onChange })` deliver the **complete, self-contained JSON after every edit**.
  `designer.getLayout()` returns the same JSON at any time, so a save button can also read it directly.
* If the layout arrives *after* the component is mounted (client-side fetch), pass it when it is there: the wrappers call `setLayout()` for you, without echoing it back through `onChange`. A value with the same content as what the Designer shows is ignored.
* Fonts, `locale` and `images` are read once when the Designer is created.
* Working examples with an API route as "database" are in the repository: [`examples/next`](examples/next) and [`examples/nuxt`](examples/nuxt), both rendering PDFs on the server too.

## Designer features

Canvas with zoom, grid and snap, **rulers (mm) with guides** dragged out of them (top ruler → horizontal, left ruler → vertical; drag a guide to move it, off the page or double-click to delete; they are saved in the layout as `guides` and never printed), **smart guides** (edges and centres of other elements, the page, the content box and your own guides; hold Alt to disable), drag/resize, **multi-select**
(shift/ctrl-click, Ctrl+A or a rubber-band rectangle dragged on empty space or on the stationery; move, align, duplicate, delete together), **undo/redo** (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, 100 steps, `designer.undo()` / `redo()`),
property panel, layer order, flow list with drag-to-reorder, rich text with colour, size and alignment, placeholder picker, live preview, image optimisation, warnings.

## Page numbers

"Seite x von y" is an ordinary text element, not a hidden footer setting: a new Designer starts with it just below the content box, and you can move it, resize it, restyle it, give it a page rule (e.g. not on the first page), delete it or add more (toolbar: *Seitenzahl*).
Any static text box or address field can contain `{{page}}` (the current page) and `{{pages}}` (the number of pages), so `Blatt {{page}} / {{pages}}` or `{{page}}` alone work too.
In a batch the numbers count per record. Layouts saved with the old fixed `page.footer` are converted to such an element when they are loaded.

## Dynamic content per document

A flow block of type `dynamicSections` renders whatever sequence your app sends in `data[source]`: a table, two text blocks, another table – any order, any length (also none).
Each item is `{ "type": "text", "content": … }` (plain text, runs, or rich blocks with lists, placeholders allowed) or `{ "type": "table", "columns": [...], "rows": [...] }` (every table brings its own columns).
The layout only supplies the styling (`styles.table`, `styles.text`) and the position between its fixed blocks; long sequences break across pages and tables repeat their header.
You can use several `dynamicSections` blocks reading different keys, and in a batch every record carries its own sequence.

**Form letters:** put the whole letter in the layout – rich text next to `{{placeholders}}`, address field, logo – and send one data object per recipient.
For recipient-specific passages use `visibleWhen` on a block, or a `dynamicSections` block if the passages differ in number and order.

## Spacing between flow blocks

Every text, table and totals block can carry a `margin` (millimetres, all sides optional, default 0) that keeps distance to its neighbours. It is added to the block's own default spacing:

```json
{ "type": "text", "content": "Thank you!", "margin": { "top": 12, "bottom": 6, "left": 0, "right": 0 } }
```

* `top` / `bottom` space the block from the blocks above and below it.
* `left` / `right` indent the block; for blocks that share a row (`sameRow`) they space it from the neighbour to the left or right. A block's `width` in a row is its outer width, margins included.
* In the Designer: select a block and use *Spacing around the block* in the properties panel. The canvas shows the spacing true to scale.

## Fonts per element

The document font (`page.defaults.font`) is the default. Every text box, address field and flow block (text, table, totals, dynamic sections) can set
`"font": "Merriweather"` to use another family from the registry; leave it out to inherit. The Designer offers "Document (Inter)" as the first entry of every font select.

## Conditional elements (`visibleWhen`)

Any static element or flow block can carry `"visibleWhen": { "path": "kunde.zusatz", "op": "exists" }`.
Operators: `exists`, `empty`, `equals`, `notEquals` (compared as text) and `gt`, `gte`, `lt`, `lte` (compared as numbers; `"7,5"` counts as 7.5, non-numbers are false).
Comparisons combine with `all` (AND), `any` (OR) and `not`, nested as deep as needed:

```json
{ "visibleWhen": { "all": [ { "path": "betrag", "op": "gt", "value": 100 }, { "any": [ { "path": "vip" }, { "not": { "path": "rabatt" } } ] } ] } }
```

The Designer has an expression builder for this. It is evaluated per Record, so in a batch each letter shows or hides it on its own. It is a closed set of operators, not a scripting language.

## Layout JSON

A layout has two layers: a **static layer** of freely positioned elements and a **flow layer** that flows and breaks across pages.
All lengths are millimetres.

```jsonc
{
  "schemaVersion": 1, "locale": "de-DE", "currency": "EUR",
  "page": {
    "size": "A4", "orientation": "portrait",
    "contentBox": { "first": { "top": 95, "bottom": 30, "left": 25, "right": 20 }, "follow": { "top": 30, "bottom": 30, "left": 25, "right": 20 } },
    "defaults": { "font": "Inter", "size": 10, "color": "#222222" },
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

Your app serves the font files (TTF/OTF, e.g. from Google Fonts, OFL) and declares them **once**. The layout stores only the family name.

```ts
import { defineFonts } from 'pdfmake-layout-designer-core'

const fonts = defineFonts([
  { family: 'Inter', files: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-BoldItalic.ttf' } },
])
fonts.at('/fonts')                          // browser: URLs, for the Designer's `fonts`
fonts.at(`${process.cwd()}/public/fonts`)   // server: file paths, for generate()'s `fonts`
```

`FontRegistry` itself is a plain array of `{ family, files }`; use it directly if you prefer. URLs in the browser, file paths in Node. Missing styles fall back to the regular file; an unknown family falls back to the bundled **Roboto** (with a warning).
The Designer loads the same files through the `FontFace` API so canvas and PDF match.

## Example: invoices and form letters from a database

The same example exists in every demo. Customers and invoices come from a JSON "database", the stored Layouts are loaded, filled and turned into PDFs:

| Demo | Page | PDFs are made |
| --- | --- | --- |
| Next.js (`examples/next`, port 5301) | `/generator` | on the server, in API routes |
| Nuxt (`examples/nuxt`, port 5302) | `/generator` | on the server, in Nitro routes |
| Vanilla (`pnpm dev`, port 5199) | `/generator.html` | in the browser |

* **Invoices:** ten positions per invoice, one PDF per invoice or all invoices in one PDF (`generateBatch`).
* **Form letters:** one personalised letter per selected customer (Lorem ipsum, stationery, SVG logo and a PNG seal), all in a single PDF.

The rows are in `examples/shared/generator/db.json`, the Layouts are `invoice.layout.json` and `letter.layout.json` next to it (written by `seed.mjs`, but any Layout from the Designer works the same way). `service.mjs` is the Host App's side (it has no framework dependency, so it works in any Node backend): read rows, pick the Layout, call `generate` / `generateBatch`.

## Development

The repository is a pnpm workspace (`packages/*` are the published packages, `examples/*` are demos).

```bash
pnpm install
pnpm check         # typecheck, build, unit tests, built-package smoke test, Playwright e2e
pnpm dev           # demo app with all fixtures: http://localhost:5199
```

The Designer's styles are written with Tailwind CSS v4 in `packages/designer/src/theme.css` and compiled into a plain CSS string: run `node scripts/build-styles.mjs` after changing them.

## Known limits

* The rich-text editor edits bold, italic, underline, text colour, font size (pt), paragraph alignment and lists. A font family is set per block, not per word.
* `strategy: 'merge'` cannot combine with `pdfa` or `attachments` (pdf-lib joins plain PDFs).
* The live preview updates while the preview tab is open.
* pdfmake has one set of page margins per document: see "Content box" above.

## Built on

This project stands on the work of others. Thank you to:

| Project | Used for | License |
| --- | --- | --- |
| [pdfmake](https://github.com/bpampuch/pdfmake) | PDF rendering | MIT |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | joining PDFs in `generateBatch` (optional peer dependency) | MIT |
| [Zod](https://zod.dev) | schema validation | MIT |
| [Tiptap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) | rich-text editing in the Designer | MIT |
| [Tailwind CSS](https://tailwindcss.com) | Designer styles, compiled at build time | MIT |
| [Roboto](https://github.com/googlefonts/roboto) | bundled default font | Apache-2.0 |

## License

[MIT](LICENSE). The bundled Roboto font is licensed under Apache-2.0.
