import { cn } from '@/lib/utils'

/** Shimmering placeholder block. Decorative — hidden from assistive tech. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('numa-shimmer rounded-md', className)} />
}
