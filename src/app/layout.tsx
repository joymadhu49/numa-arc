import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/components/providers'
import { Sidebar } from '@/components/sidebar/sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Numa',
  description: 'Numa — the stablecoin DeFi copilot on Arc.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
