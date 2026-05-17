import { Suspense } from 'react'
import { Chat } from '@/components/chat/chat'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  )
}
