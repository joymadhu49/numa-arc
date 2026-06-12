'use client'

/**
 * Local chat-history persistence (localStorage), scoped per wallet address so
 * different wallets on the same browser never see each other's conversations.
 *
 * Layout:
 *  - `numa.chats.<address>`        → ConversationMeta[] (the index, newest first)
 *  - `numa.chat.<address>.<id>`    → the conversation's UIMessage[] payload
 *
 * All functions are SSR-safe no-ops and swallow storage failures (private
 * browsing, quota) — persistence is best-effort, never a hard dependency.
 */

export interface ConversationMeta {
  id: string
  title: string
  updatedAt: number
  count: number
}

/** Keep at most this many conversations per wallet; oldest are evicted. */
const MAX_CONVERSATIONS = 20

function indexKey(address: string): string {
  return `numa.chats.${address.toLowerCase()}`
}
function chatKey(address: string, id: string): string {
  return `numa.chat.${address.toLowerCase()}.${id}`
}

function safeGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
  } catch {
    /* quota / private mode — best effort */
  }
}
function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
}

export function listConversations(address: string): ConversationMeta[] {
  const raw = safeGet(indexKey(address))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ConversationMeta[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function latestConversationId(address: string): string | null {
  return listConversations(address)[0]?.id ?? null
}

export function loadConversation<T>(address: string, id: string): T[] | null {
  const raw = safeGet(chatKey(address, id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Derive a list title from the first user text part (UIMessage shape). */
function deriveTitle(messages: unknown[]): string {
  for (const m of messages) {
    const msg = m as { role?: string; parts?: Array<{ type?: string; text?: string }> }
    if (msg.role !== 'user') continue
    const text = msg.parts?.find((p) => p.type === 'text' && p.text)?.text
    if (text) return text.length > 64 ? `${text.slice(0, 64)}…` : text
  }
  return 'New conversation'
}

export function saveConversation(address: string, id: string, messages: unknown[]): void {
  if (messages.length === 0) return
  safeSet(chatKey(address, id), JSON.stringify(messages))
  const meta: ConversationMeta = {
    id,
    title: deriveTitle(messages),
    updatedAt: Date.now(),
    count: messages.length,
  }
  const rest = listConversations(address).filter((c) => c.id !== id)
  const next = [meta, ...rest]
  for (const evicted of next.splice(MAX_CONVERSATIONS)) {
    safeRemove(chatKey(address, evicted.id))
  }
  safeSet(indexKey(address), JSON.stringify(next))
}

export function deleteConversation(address: string, id: string): void {
  safeRemove(chatKey(address, id))
  const next = listConversations(address).filter((c) => c.id !== id)
  safeSet(indexKey(address), JSON.stringify(next))
}
