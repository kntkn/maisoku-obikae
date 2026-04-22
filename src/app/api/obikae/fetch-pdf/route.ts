import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Server-side proxy that fetches a pre-secured maisoku asset (PDF or image)
 * and returns it as base64 to the browser. This lets the obikae popup skip
 * the slow `/api/reins/fetch-maisoku` round-trip when the bukkaku pipeline
 * already secured a URL.
 *
 * Security:
 *  - Auth required (Supabase session)
 *  - URL must be http(s)
 *  - Response size is capped to avoid abuse
 */
const MAX_BYTES = 25 * 1024 * 1024 // 25MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const url: string = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'only http(s) urls allowed' }, { status: 400 })
    }

    const res = await fetch(parsed.toString(), {
      method: 'GET',
      // No credentials forwarded — this endpoint acts as a user-authenticated proxy only.
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: 502 }
      )
    }

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: 'empty response' }, { status: 502 })
    }
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'response too large' }, { status: 413 })
    }

    const b64 = Buffer.from(buf).toString('base64')

    // "source" lets the caller mirror the /api/reins/fetch-maisoku contract:
    // "pdf" → already a PDF; "screenshot" → image that needs embedding.
    const isPdf = contentType.includes('pdf') || parsed.pathname.toLowerCase().endsWith('.pdf')
    const isImage = contentType.startsWith('image/')

    return NextResponse.json({
      ok: true,
      contentType,
      byteLength: buf.byteLength,
      source: isPdf ? 'pdf' : isImage ? 'screenshot' : 'pdf',
      data: b64,
    })
  } catch (err) {
    console.error('[obikae/fetch-pdf] error:', err)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
