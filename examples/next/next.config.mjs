import { withLayoutDesigner } from 'pdfmake-layout-designer-react/next'

// withLayoutDesigner keeps pdfmake out of the server bundle so generate() works in route handlers
export default withLayoutDesigner({
  allowedDevOrigins: ['*'], // only so the demo can be opened from other devices in the network
})
