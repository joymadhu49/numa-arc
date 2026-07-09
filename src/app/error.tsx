'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/** Route-segment error boundary — renders inside the app shell (sidebar stays). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
        <AlertTriangle className="h-6 w-6 text-danger" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-fg">
          An unexpected error interrupted this view. Your wallet session is preserved. Try again.
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
        <RotateCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  )
}
