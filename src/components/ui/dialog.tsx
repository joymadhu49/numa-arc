import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FocusTrap } from 'focus-trap-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  if (!open) return null

  return createPortal(
    // FocusTrap keeps Tab within the dialog, sends Esc to onClose, and restores
    // focus to the triggering element when the dialog unmounts.
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: true,
        returnFocusOnDeactivate: true,
        onDeactivate: onClose,
        fallbackFocus: '[data-dialog-panel]',
      }}
    >
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div
          data-dialog-panel
          tabIndex={-1}
          className={cn(
            'relative z-10 w-full max-w-md rounded-2xl border border-border-c bg-popover shadow-2xl focus:outline-none',
          )}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </div>
      </div>
    </FocusTrap>,
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
