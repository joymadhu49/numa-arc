'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>,
    document.body,
  )
}

interface DialogContentProps {
  className?: string
  children: ReactNode
}

export function DialogContent({ className, children }: DialogContentProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'mx-4 rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ className, children }: DialogContentProps) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)}>{children}</div>
}

export function DialogTitle({ className, children }: DialogContentProps) {
  return (
    <h2 className={cn('text-base font-semibold tracking-tight', className)}>{children}</h2>
  )
}

export function DialogDescription({ className, children }: DialogContentProps) {
  return <p className={cn('text-xs text-neutral-400', className)}>{children}</p>
}

export function DialogFooter({ className, children }: DialogContentProps) {
  return (
    <div className={cn('mt-6 flex items-center justify-end gap-2', className)}>{children}</div>
  )
}
