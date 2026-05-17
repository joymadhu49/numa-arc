import { SYSTEM_PROMPT } from '@/ai/system-prompt'
import { TOOLS } from '@/ai/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

interface ToolCallSpec {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: ChatRole
  content: string
  tool_call_id?: string
  name?: string
  tool_calls?: ToolCallSpec[]
}

interface ChatRequestBody {
  messages: ChatMessage[]
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o'

function encodeSse(event: string, data: unknown): Uint8Array {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`)
}

interface OpenRouterDelta {
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: 'function'
    function?: { name?: string; arguments?: string }
  }>
}

interface OpenRouterChunk {
  id?: string
  choices?: Array<{
    index: number
    delta?: OpenRouterDelta
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface AccumulatedToolCall {
  id: string
  name: string
  argumentsBuf: string
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'missing_openrouter_api_key' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...body.messages.map((m): ChatMessage => {
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: m.content ?? '',
          tool_calls: m.tool_calls,
        }
      }
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id ?? '',
          ...(m.name ? { name: m.name } : {}),
        }
      }
      return { role: m.role, content: m.content }
    }),
  ]

  const orResponse = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'http-referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://arcwise.app',
      'x-title': 'Arcwise',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      stream: true,
      max_tokens: 4096,
    }),
  })

  if (!orResponse.ok || !orResponse.body) {
    const text = await orResponse.text().catch(() => '')
    return new Response(
      JSON.stringify({ error: 'openrouter_failed', status: orResponse.status, detail: text }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  const upstream = orResponse.body
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(encodeSse(event, data))
      }

      const reader = upstream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const toolCalls = new Map<number, AccumulatedToolCall>()
      let flushed = false

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || !line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') continue

            let chunk: OpenRouterChunk
            try {
              chunk = JSON.parse(payload) as OpenRouterChunk
            } catch {
              continue
            }

            const choice = chunk.choices?.[0]
            const delta = choice?.delta
            if (!delta) continue

            if (typeof delta.content === 'string' && delta.content.length > 0) {
              send('text', { delta: delta.content })
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.get(tc.index) ?? {
                  id: '',
                  name: '',
                  argumentsBuf: '',
                }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) existing.argumentsBuf += tc.function.arguments
                toolCalls.set(tc.index, existing)
              }
            }

            if (choice?.finish_reason && !flushed) {
              flushed = true
              for (const call of toolCalls.values()) {
                let input: unknown = {}
                try {
                  input = call.argumentsBuf ? JSON.parse(call.argumentsBuf) : {}
                } catch {
                  input = { _raw: call.argumentsBuf }
                }
                send('tool_use', { id: call.id, name: call.name, input })
              }
              send('done', { stopReason: choice.finish_reason, usage: chunk.usage ?? null })
            }
          }
        }
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        send('error', { message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
