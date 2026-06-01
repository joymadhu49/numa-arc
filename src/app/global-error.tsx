'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'
import './globals.css'

/**
 * Last-resort boundary that catches errors in the root layout itself. It
 * replaces the entire document, so it must render its own <html>/<body> and
 * import the global stylesheet. Pinned to dark (next-themes can't run here).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
            <AlertTriangle className="h-6 w-6 text-danger" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Numa hit an unexpected error</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-fg">
              The app crashed while rendering. Reloading usually fixes it.
            </p>
            {error?.digest ? (
              <p className="mt-2 font-mono text-2xs text-muted-fg">ref: {error.digest}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" /> Reload Numa
          </button>
        </div>
      </body>
    </html>
  )
}
