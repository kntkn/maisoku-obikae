'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type {
  PublishedPage,
  SwipeResult,
  SwipeEvent,
} from '@/lib/database.types'
import {
  ProposalDashboard,
  type ProposalDashboardData,
  type ListingWithThumb,
} from '@/components/proposals/proposal-dashboard'

export default function ProposalFeedbackPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ProposalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: p } = await supabase
          .from('proposal_sets')
          .select('*')
          .eq('id', id)
          .single()
        if (!p) return

        const { data: listingRows } = await supabase
          .from('published_listings')
          .select('*')
          .in('id', p.listing_ids)

        const { data: pages } = await supabase
          .from('published_pages')
          .select('listing_id, page_number, image_url, width, height')
          .in('listing_id', p.listing_ids)
          .order('listing_id', { ascending: true })
          .order('page_number', { ascending: true })

        const pagesByListing = new Map<string, { image_url: string; width: number | null; height: number | null }[]>()
        ;(pages ?? []).forEach((pg: Pick<PublishedPage, 'listing_id' | 'image_url' | 'width' | 'height'>) => {
          const arr = pagesByListing.get(pg.listing_id) ?? []
          arr.push({ image_url: pg.image_url, width: pg.width, height: pg.height })
          pagesByListing.set(pg.listing_id, arr)
        })

        const listings = new Map<string, ListingWithThumb>()
        ;(listingRows ?? []).forEach((l) => {
          const lp = pagesByListing.get(l.id) ?? []
          listings.set(l.id, {
            ...l,
            thumbnailUrl: lp[0]?.image_url ?? null,
            pages: lp,
          })
        })

        const { data: results } = await supabase
          .from('swipe_results')
          .select('*')
          .eq('proposal_id', p.id)
        const resultsMap = new Map<string, SwipeResult>()
        ;(results ?? []).forEach((r: SwipeResult) => resultsMap.set(r.listing_id, r))

        const { data: events } = await supabase
          .from('swipe_events')
          .select('*')
          .eq('proposal_id', p.id)
          .order('ts', { ascending: true })
          .limit(1000)

        if (cancelled) return
        setData({
          proposal: p,
          listings,
          results: resultsMap,
          events: (events ?? []) as SwipeEvent[],
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, supabase])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">提案が見つかりません</p>
      </div>
    )
  }

  return <ProposalDashboard data={data} variant="owner" />
}
