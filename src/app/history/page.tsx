'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, History as HistoryIcon, MessageSquare, Trash2 } from 'lucide-react'
import {
  deleteConversation,
  listConversations,
  type ConversationMeta,
} from '@/lib/chat-history'
import { AuthGate } from '@/components/auth/auth-gate'
import { useAuth } from '@/lib/use-auth'

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function HistoryPage() {
  const { address, signedIn } = useAuth()
  const [conversations, setConversations] = useState<ConversationMeta[]>([])

  useEffect(() => {
    setConversations(address ? listConversations(address) : [])
  }, [address])

  if (!signedIn || !address) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
        <AuthGate>
          <div />
        </AuthGate>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">History</h1>
        <p className="text-sm text-muted-fg">
          Your past conversations with Numa, saved on this device. Pick up where you left off.
        </p>
      </header>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border-c bg-card/60 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HistoryIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg">No conversations yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-fg">
              Your chats with Numa will appear here once you send your first message.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110"
          >
            Start chatting <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <ul role="list" className="overflow-hidden rounded-2xl border border-border-c bg-card">
          {conversations.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 border-b border-border-c/60 px-4 py-3 transition last:border-b-0 hover:bg-muted-bg/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <Link href={`/?c=${c.id}`} className="group min-w-0 flex-1 focus-visible:outline-none">
                <span className="block truncate text-sm font-medium text-fg group-hover:underline group-focus-visible:underline">
                  {c.title}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-fg">
                  {formatWhen(c.updatedAt)} · {c.count} {c.count === 1 ? 'message' : 'messages'}
                </span>
              </Link>
              <button
                type="button"
                aria-label={`Delete conversation: ${c.title}`}
                onClick={() => {
                  deleteConversation(address, c.id)
                  setConversations(listConversations(address))
                }}
                className="shrink-0 rounded-md p-1.5 text-muted-fg transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
