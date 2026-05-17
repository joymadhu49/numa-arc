'use client'

let patched = false

export function patchCircleFetch(): void {
  if (patched || typeof window === 'undefined') return
  patched = true
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlString: string
    if (typeof input === 'string') urlString = input
    else if (input instanceof URL) urlString = input.toString()
    else urlString = input.url

    if (urlString.startsWith('https://api.circle.com/')) {
      const rewritten = urlString.replace('https://api.circle.com', '/api/circle-proxy')
      if (typeof input === 'string' || input instanceof URL) {
        return original(rewritten, init)
      }
      const cloned = new Request(rewritten, input)
      return original(cloned, init)
    }
    return original(input, init)
  }
}
