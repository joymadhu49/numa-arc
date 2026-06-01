import Link from 'next/link'
import { ArrowRight, History as HistoryIcon } from 'lucide-react'

export default function HistoryPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">History</h1>
        <p className="text-sm text-muted-fg">
          Every Numa action, attested on Arc. Filterable by tool, status, and tx hash.
        </p>
      </header>

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border-c bg-card/60 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HistoryIcon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-fg">No activity yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-fg">
            Your swaps, sends, bridges, and agent jobs will appear here once you make your first
            move.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110"
        >
          Start a transaction <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
