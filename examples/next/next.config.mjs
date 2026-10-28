import { withPdfLayouter } from '@pdf-layouter/react/next'

// withPdfLayouter keeps pdfmake out of the server bundle so generate() works in route handlers
export default withPdfLayouter({
  allowedDevOrigins: ['*'], // only so the demo can be opened from other devices in the network
})
