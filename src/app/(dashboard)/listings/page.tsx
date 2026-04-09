'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import type { NotionListing } from '@/types/notion'

const STATUS_COLORS: Record<string, string> = {
  '未処理': 'bg-gray-100 text-gray-700',
  '処理中': 'bg-yellow-100 text-yellow-700',
  'ヒット': 'bg-green-100 text-green-700',
  '該当なし': 'bg-gray-100 text-gray-500',
  'エラー': 'bg-red-100 text-red-700',
  '問合せあり': 'bg-green-100 text-green-700',
  '問合せなし': 'bg-gray-100 text-gray-500',
}

function Badge({ text }: { text: string }) {
  if (!text) return <span className="text-gray-300">—</span>
  const color = STATUS_COLORS[text] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {text}
    </span>
  )
}

export default function ListingsPage() {
  const [listings, setListings] = useState<NotionListing[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/notion/listings')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setListings(data)
        else toast.error('物件データの取得に失敗しました')
      })
      .catch(() => toast.error('通信エラー'))
      .finally(() => setLoading(false))
  }, [])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === listings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(listings.map((l) => l.id)))
    }
  }

  const handleObikae = async () => {
    const selected = listings.filter((l) => selectedIds.has(l.id))
    const reinsIds = selected.map((l) => l.reinsId).filter(Boolean)

    if (reinsIds.length === 0) {
      toast.error('Reins IDのある物件を選択してください')
      return
    }

    setProcessing(true)
    setProgress(`REINS図面取得中... (0/${reinsIds.length}件)`)

    try {
      const res = await fetch('/api/reins/fetch-maisoku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reinsIds }),
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const data = await res.json()
      const pdfBase64List: string[] = []
      let successCount = 0

      for (const result of data.results) {
        if (result.status !== 'success' || !result.pdfs?.length) continue

        for (const pdfBase64 of result.pdfs) {
          pdfBase64List.push(pdfBase64)
        }
        successCount++
        setProgress(`REINS図面取得中... (${successCount}/${reinsIds.length}件)`)
      }

      if (pdfBase64List.length === 0) {
        toast.error('図面の取得に失敗しました')
        return
      }

      // Store in sessionStorage and navigate to editor
      sessionStorage.setItem('reins-pdfs', JSON.stringify(pdfBase64List))
      toast.success(`${pdfBase64List.length}件の図面を取得しました`)
      router.push('/editor?source=reins')
    } catch (error) {
      console.error('REINS fetch error:', error)
      toast.error('REINS画像の取得に失敗しました')
    } finally {
      setProcessing(false)
      setProgress('')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">提案物件一覧</h2>
          <p className="text-muted-foreground">
            Notion DBの物件データを表示しています（{listings.length}件）
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size}件選択中
            </span>
            <Button onClick={handleObikae} disabled={processing}>
              {processing ? progress : '選択した物件を帯替えする'}
            </Button>
          </div>
        )}
      </div>

      {processing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <p className="text-sm text-blue-800">{progress}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === listings.length && listings.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="p-3 text-left font-medium">Reins ID</th>
                <th className="p-3 text-left font-medium">Round</th>
                <th className="p-3 text-left font-medium">AD</th>
                <th className="p-3 text-left font-medium">物確ステータス</th>
                <th className="p-3 text-left font-medium">物確結果</th>
                <th className="p-3 text-left font-medium">完成URL</th>
                <th className="p-3 text-left font-medium">提案/却下</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedIds.has(item.id) ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{item.reinsId}</td>
                  <td className="p-3">{item.round ?? '—'}</td>
                  <td className="p-3">
                    {item.adStatus ? (
                      <span className="text-green-600 font-medium">あり</span>
                    ) : (
                      <span className="text-gray-400">なし</span>
                    )}
                  </td>
                  <td className="p-3"><Badge text={item.bukakuStatus} /></td>
                  <td className="p-3"><Badge text={item.bukakuResult} /></td>
                  <td className="p-3">
                    {item.completedUrl ? (
                      <a
                        href={item.completedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        リンク
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="p-3"><Badge text={item.proposalStatus ?? ''} /></td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    物件データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
