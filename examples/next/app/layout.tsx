import type { ReactNode } from 'react'

export const metadata = { title: 'pdfmake Layout Designer – Next.js' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
