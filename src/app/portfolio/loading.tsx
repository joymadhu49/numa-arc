import { Skeleton } from '@/components/ui/skeleton'

export default function PortfolioLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </header>
      <div className="overflow-hidden rounded-xl border border-border-c bg-card" aria-busy="true">
        <div className="border-b border-border-c px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-40" />
        </div>
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
