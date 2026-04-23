import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type {
  PublishedListing,
  PublishedPage,
  ProposalSet,
  SwipeEvent,
  SwipeResult,
} from '@/lib/database.types'
import {
  ProposalDashboard,
  type ListingWithThumb,
} from '@/components/proposals/proposal-dashboard'

type Props = { params: Promise<{ token: string }> }

async function createTokenClient(token: string) {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          /* read-only share view */
        },
      },
      global: {
        // The share_token-based RLS policy reads this header via
        // current_setting('request.headers').
        headers: { 'x-share-token': token },
      },
    },
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const supabase = await createTokenClient(token)
  const { data } = await supabase
    .from('proposal_sets')
    .select('customer_name')
    .eq('share_token', token)
    .single()
  return { title: data ? `${data.customer_name}様 — 行動レビュー` : 'Not Found' }
}

export default async function ProposalSharePage({ params }: Props) {
  const { token } = await params
  const supabase = await createTokenClient(token)

  const { data: proposal } = await supabase
    .from('proposal_sets')
    .select('*')
    .eq('share_token', token)
    .single<ProposalSet>()

  if (!proposal) notFound()

  const { data: listingRows } = await supabase
    .from('published_listings')
    .select('*')
    .in('id', proposal.listing_ids)

  const { data: pages } = await supabase
    .from('published_pages')
    .select('listing_id, page_number, image_url')
    .in('listing_id', proposal.listing_ids)
    .eq('page_number', 1)

  const thumbByListing = new Map<string, string>()
  ;(pages ?? []).forEach((pg: Pick<PublishedPage, 'listing_id' | 'image_url'>) => {
    thumbByListing.set(pg.listing_id, pg.image_url)
  })

  const listings = new Map<string, ListingWithThumb>()
  ;(listingRows ?? []).forEach((l: PublishedListing) => {
    listings.set(l.id, { ...l, thumbnailUrl: thumbByListing.get(l.id) ?? null })
  })

  const { data: results } = await supabase
    .from('swipe_results')
    .select('*')
    .eq('proposal_id', proposal.id)
  const resultsMap = new Map<string, SwipeResult>()
  ;(results ?? []).forEach((r: SwipeResult) => resultsMap.set(r.listing_id, r))

  const { data: events } = await supabase
    .from('swipe_events')
    .select('*')
    .eq('proposal_id', proposal.id)
    .order('ts', { ascending: true })
    .limit(1000)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-800">
        チーム共有ビュー (読み取り専用)
      </div>
      <ProposalDashboard
        data={{
          proposal,
          listings,
          results: resultsMap,
          events: (events ?? []) as SwipeEvent[],
        }}
        variant="shared"
      />
    </div>
  )
}
