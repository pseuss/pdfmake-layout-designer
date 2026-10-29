# @pdf-layouter/core

Layout JSON + your data → PDF. Schema and validation, placeholder resolver, compiler to [pdfmake](https://pdfmake.github.io/docs/) and `generate()` / `generateBatch()`. Runs in Node and in the browser, no UI dependencies.

```ts
import { generate, generateBatch } from '@pdf-layouter/core'

const pdf = await generate(layout, data)                                   // one document
const letters = await generateBatch(layout, records, { onePagePerRecord: true }) // one page per record
```

Full documentation, the layout format and the visual designer: <https://github.com/pseuss/pdf-layouter#readme>
