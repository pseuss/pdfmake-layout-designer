# @pdf-layouter/designer

Embeddable visual layout designer for PDF documents, written in plain TypeScript (no framework, no CSS import needed). It edits one self-contained JSON per layout that [`@pdf-layouter/core`](https://www.npmjs.com/package/@pdf-layouter/core) turns into a PDF.

```ts
import { Designer } from '@pdf-layouter/designer'

const designer = new Designer({
  container: document.getElementById('designer')!,
  placeholders: catalog,
  sampleData,
  onChange: (layout) => save(layout),
})
```

React and Vue wrappers: `@pdf-layouter/react`, `@pdf-layouter/vue`.

Full documentation: <https://github.com/pseuss/pdf-layouter#readme>
