import Link from 'next/link'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold tracking-tight text-fg">404</p>
      <div>
        <h1 className="text-lg font-semibold text-fg">Page not found</h1>
        <p className="mt-1 text-sm text-muted-fg">This page doesn&apos;t exist or may have moved.</p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110"
      >
        <Home className="h-4 w-4" /> Back to Numa
      </Link>
    </div>
  )
}
