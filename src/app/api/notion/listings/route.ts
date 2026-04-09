import { NextResponse } from 'next/server'
import type { NotionListing } from '@/types/notion'

export const dynamic = 'force-dynamic'

export async function GET() {
  const notionApiKey = process.env.NOTION_API_KEY?.trim()
  const rawDatabaseId = process.env.NOTION_FANGO_RECOMMEND_DB_ID?.trim()

  if (!notionApiKey || !rawDatabaseId) {
    return NextResponse.json(
      { error: 'Notion credentials not configured' },
      { status: 500 }
    )
  }

  const databaseId = rawDatabaseId.includes('-')
    ? rawDatabaseId
    : rawDatabaseId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')

  try {
    const allResults: NotionListing[] = []
    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      const body: Record<string, unknown> = {
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }
      if (startCursor) body.start_cursor = startCursor

      const res = await fetch(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const err = await res.text()
        console.error('[notion/listings] API error:', err)
        return NextResponse.json(
          { error: 'Notion API error' },
          { status: res.status }
        )
      }

      const data = await res.json()

      for (const page of data.results) {
        const props = page.properties
        allResults.push({
          id: page.id,
          reinsId: getTitle(props['Reins ID']),
          userId: getText(props['User ID']),
          round: getNumber(props['Round']),
          adStatus: getCheckbox(props['AD有無']),
          bukakuPf: getText(props['物確PF']),
          bukakuStatus: getSelect(props['物確ステータス']),
          bukakuResult: getSelect(props['物確結果']),
          completedUrl: getUrl(props['完成URL']),
          proposalStatus: getSelect(props['提案/却下']),
        })
      }

      hasMore = data.has_more
      startCursor = data.next_cursor
    }

    return NextResponse.json(allResults)
  } catch (error) {
    console.error('[notion/listings] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    )
  }
}

// --- Notion property extractors ---

function getTitle(prop: { title?: { plain_text: string }[] }): string {
  return prop?.title?.[0]?.plain_text ?? ''
}

function getText(prop: { rich_text?: { plain_text: string }[] }): string {
  return prop?.rich_text?.[0]?.plain_text ?? ''
}

function getNumber(prop: { number?: number | null }): number | null {
  return prop?.number ?? null
}

function getCheckbox(prop: { checkbox?: boolean }): boolean {
  return prop?.checkbox ?? false
}

function getSelect(prop: { select?: { name: string } | null }): string {
  return prop?.select?.name ?? ''
}

function getUrl(prop: { url?: string | null }): string | null {
  return prop?.url ?? null
}
