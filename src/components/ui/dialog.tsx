import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl border border-border-c bg-popover shadow-2xl',
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border-c px-5 py-4', className)} {...props} />
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <h2 className={cn('text-base font-semibold text-fg', className)} {...props} />
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}
