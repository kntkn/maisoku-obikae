import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { reinsIds } = await request.json()

  if (!Array.isArray(reinsIds) || reinsIds.length === 0) {
    return NextResponse.json({ error: 'reinsIds required' }, { status: 400 })
  }

  // Production: proxy to external Playwright-capable backend
  const backendUrl = process.env.REINS_BACKEND_URL
  if (backendUrl) {
    const res = await fetch(`${backendUrl}/api/reins/fetch-maisoku`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reinsIds }),
    })
    return NextResponse.json(await res.json())
  }

  // Dev: run Playwright locally
  try {
    const { chromium } = await import('playwright')
    const { fetchMaisokuPdfs } = await import('@/lib/reins/runner')
    const results = await fetchMaisokuPdfs(reinsIds, chromium)
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('[reins/fetch-maisoku] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch REINS images. Playwright may not be available.' },
      { status: 500 }
    )
  }
}
