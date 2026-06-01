'use client'

import { useTheme } from 'next-themes'
import { Toaster as SonnerToaster } from 'sonner'

/**
 * Brand-themed sonner toaster, kept in sync with the active next-themes color
 * scheme. Mounted once inside Providers; emit with `toast()` from anywhere.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <SonnerToaster
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-border-c bg-popover text-fg shadow-elevation-3 font-sans',
          title: 'text-sm font-medium text-fg',
          description: 'text-xs text-muted-fg',
          actionButton: 'rounded-md bg-primary px-2 text-primary-fg',
          cancelButton: 'rounded-md bg-muted-bg px-2 text-fg',
        },
      }}
    />
  )
}
