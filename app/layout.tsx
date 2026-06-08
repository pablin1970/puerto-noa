import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Puerto NOA SpA — Sistema logístico',
  description: 'Sistema de cotización y seguimiento logístico China → NOA Argentino',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
