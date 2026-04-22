'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import type { ProposalSet, PublishedListing } from '@/lib/database.types'
import { getPublicBaseUrl } from '@/lib/public-url'

export default function ProposalResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [proposal, setProposal] = useState<ProposalSet | null>(null)
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

        const { data: listingsRes } = await supabase
          .from('published_listings')
          .select('*')
          .in('id', p.listing_ids)

        const map = new Map<string, PublishedListing>()
        listingsRes?.forEach((l) => map.set(l.id, l))
        setListings(map)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const copyUrl = async () => {
    if (!proposal) return
    await navigator.clipboard.writeText(`${getPublicBaseUrl()}/propose/${proposal.slug}`)
    toast.success('URLをコピーしました')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">提案が見つかりません</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/proposals" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; 提案一覧
          </Link>
          <h2 className="text-2xl font-bold tracking-tight mt-1">{proposal.customer_name}</h2>
          <p className="text-muted-foreground">
            {proposal.listing_ids.length}物件 &middot;{' '}
            {new Date(proposal.created_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
        <Button variant="outline" onClick={copyUrl}>
          提案URLコピー
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">含まれる物件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {proposal.listing_ids.map((listingId) => {
              const listing = listings.get(listingId)
              return (
                <div key={listingId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{listing?.title || listingId}</p>
                    {listing && (
                      <p className="text-xs text-gray-400">
                        {new Date(listing.created_at).toLocaleDateString('ja-JP')}
                      </p>
                    )}
                  </div>
                  {listing && (
                    <Link
                      href={`/p/${listing.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      ページを開く →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">
        閲覧状況は Google Analytics ({proposal.slug}) で確認できます。
      </p>
    </div>
  )
}
