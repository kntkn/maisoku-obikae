'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import type { ProposalSet, SwipeResult, PublishedListing } from '@/lib/database.types'

export default function ProposalResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [proposal, setProposal] = useState<ProposalSet | null>(null)
  const [results, setResults] = useState<SwipeResult[]>([])
  const [listings, setListings] = useState<Map<string, PublishedListing>>(new Map())
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      try {
        const { data: p } = await supabase
          .from('proposal_sets')
          .select('*')
          .eq('id', id)
          .single()

        if (!p) return
        setProposal(p)

        const [resultsRes, listingsRes] = await Promise.all([
          supabase.from('swipe_results').select('*').eq('proposal_id', p.id),
          supabase.from('published_listings').select('*').in('id', p.listing_ids),
        ])

        setResults(resultsRes.data || [])
        const map = new Map<string, PublishedListing>()
        listingsRes.data?.forEach(l => map.set(l.id, l))
        setListings(map)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const copyUrl = async () => {
    if (!proposal) return
    await navigator.clipboard.writeText(`${window.location.origin}/propose/${proposal.slug}`)
    toast.success('URLをコピーしました')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">読み込み中...</p></div>
  }

  if (!proposal) {
    return <div className="text-center py-16"><p className="text-gray-500">提案が見つかりません</p></div>
  }

  const liked = results.filter(r => r.liked)
  const passed = results.filter(r => !r.liked)
  const unanswered = proposal.listing_ids.filter(
    lid => !results.some(r => r.listing_id === lid)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/proposals" className="text-sm text-gray-500 hover:text-gray-700">&larr; 提案一覧</Link>
          <h2 className="text-2xl font-bold tracking-tight mt-1">{proposal.customer_name}</h2>
          <p className="text-muted-foreground">
            {proposal.listing_ids.length}物件 &middot; {new Date(proposal.created_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
        <Button variant="outline" onClick={copyUrl}>提案URLコピー</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-green-600">{liked.length}</p>
            <p className="text-sm text-muted-foreground">いいね</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-red-400">{passed.length}</p>
            <p className="text-sm text-muted-foreground">パス</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-400">{unanswered.length}</p>
            <p className="text-sm text-muted-foreground">未回答</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">物件ごとの結果</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {proposal.listing_ids.map((listingId) => {
              const listing = listings.get(listingId)
              const result = results.find(r => r.listing_id === listingId)

              return (
                <div key={listingId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{listing?.title || listingId}</p>
                    {result && (
                      <p className="text-xs text-gray-400">閲覧時間: {result.viewed_seconds}秒</p>
                    )}
                  </div>
                  <div>
                    {!result ? (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">未回答</span>
                    ) : result.liked ? (
                      <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">いいね</span>
                    ) : (
                      <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">パス</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
