import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CIRCLE_BASE = 'https://api.circle.com'

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const target = `${CIRCLE_BASE}/${path.join('/')}${req.nextUrl.search}`
  const headers = new Headers()
  for (const [k, v] of req.headers.entries()) {
    const lower = k.toLowerCase()
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue
    headers.set(k, v)
  }
  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  })

  const resHeaders = new Headers()
  upstream.headers.forEach((v, k) => {
    const lower = k.toLowerCase()
    if (lower === 'content-encoding' || lower === 'transfer-encoding') return
    resHeaders.set(k, v)
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  return forward(req, path)
}
