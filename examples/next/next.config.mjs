/** @type {import('next').NextConfig} */
export default {
  // pdfmake is loaded by @pdf-layouter/core in API routes; keep it as a plain Node dependency on the server.
  serverExternalPackages: ['pdfmake', 'pdf-lib'],
  allowedDevOrigins: ['*'],
}
