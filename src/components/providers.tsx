'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { WagmiProvider, useReconnect } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'
import { patchCircleFetch } from '@/lib/circle-fetch-patch'
import { AuthProvider } from '@/lib/use-auth'

if (typeof window !== 'undefined') {
  patchCircleFetch()
}

function AutoReconnect() {
  const { reconnect } = useReconnect()
  useEffect(() => {
    reconnect()
  }, [reconnect])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AutoReconnect />
            {children}
            <Toaster />
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
