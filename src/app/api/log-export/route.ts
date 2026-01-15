import { NextRequest, NextResponse } from 'next/server'

interface LogExportRequest {
  fileName: string
  userEmail: string
  companyName: string
  pageCount: number
}

export async function POST(request: NextRequest) {
  try {
    const body: LogExportRequest = await request.json()
    const { fileName, userEmail, companyName, pageCount } = body

    const notionApiKey = process.env.NOTION_API_KEY
    const databaseId = process.env.NOTION_MAISOKU_LOG_DB_ID

    // 環境変数がない場合は静かに終了（開発環境等）
    if (!notionApiKey || !databaseId) {
      console.log('[log-export] Notion credentials not configured, skipping log')
      return NextResponse.json({ success: true, skipped: true })
    }

    // Notion APIでページを作成
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          'ファイル名': {
            title: [
              {
                text: {
                  content: fileName || '不明',
                },
              },
            ],
          },
          'ユーザー': {
            email: userEmail || null,
          },
          '会社名': {
            rich_text: [
              {
                text: {
                  content: companyName || '不明',
                },
              },
            ],
          },
          'ページ数': {
            number: pageCount || 0,
          },
          '出力日時': {
            date: {
              start: new Date().toISOString(),
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('[log-export] Notion API error:', errorData)
      // デバッグ用：エラー詳細を返す
      return NextResponse.json({ success: false, error: 'Notion API error', details: errorData }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[log-export] Error:', error)
    // エラーでも200を返す（PDF出力には影響させない）
    return NextResponse.json({ success: false, error: 'Internal error' })
  }
}
