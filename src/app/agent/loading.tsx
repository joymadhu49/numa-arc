import { Skeleton } from '@/components/ui/skeleton'

export default function AgentLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </header>
      <div className="grid gap-4 rounded-2xl border border-border-c bg-card/60 p-4 sm:gap-6 sm:p-6 md:grid-cols-[240px_1fr]">
        <Skeleton className="mx-auto aspect-square w-full max-w-[220px] rounded-2xl md:max-w-none" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </main>
  )
}
