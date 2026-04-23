import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SwipeView, type ProposeListing } from './swipe-view'
import { GaScript } from '@/components/public/ga-script'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('proposal_sets')
    .select('customer_name')
    .eq('slug', slug)
    .single()

  return {
    title: data ? `${data.customer_name}様への物件提案` : 'Not Found',
  }
}

export default async function ProposePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: proposal } = await supabase
    .from('proposal_sets')
    .select('id, user_id, customer_name, listing_ids, final_ranking, ranking_comment, completed_at')
    .eq('slug', slug)
    .single()

  if (!proposal) notFound()

  // Owner's GA measurement id — so a broker's own analytics property gets
  // the customer-side swipe events, not just FANGO's platform GA.
  const { data: ownerProfile } = await supabase
    .from('company_profiles')
    .select('ga_measurement_id')
    .eq('user_id', proposal.user_id)
    .single()
  const ownerGaId = ownerProfile?.ga_measurement_id || null

  const { data: listings } = await supabase
    .from('published_listings')
    .select('id, title, highlight_tags')
    .in('id', proposal.listing_ids)

  if (!listings || listings.length === 0) notFound()

  const { data: pages } = await supabase
    .from('published_pages')
    .select('listing_id, page_number, image_url, width, height')
    .in('listing_id', proposal.listing_ids)
    .order('listing_id', { ascending: true })
    .order('page_number', { ascending: true })

  const pagesByListing = new Map<string, { image_url: string; width: number | null; height: number | null }[]>()
  for (const p of pages ?? []) {
    const arr = pagesByListing.get(p.listing_id) ?? []
    arr.push({ image_url: p.image_url, width: p.width, height: p.height })
    pagesByListing.set(p.listing_id, arr)
  }

  const listingsById = new Map(listings.map((l) => [l.id, l]))

  // Preserve the proposal-set's original listing_ids order
  const orderedListings: ProposeListing[] = proposal.listing_ids
    .map((id: string): ProposeListing | null => {
      const l = listingsById.get(id)
      if (!l) return null
      const lp = pagesByListing.get(id) ?? []
      if (lp.length === 0) return null
      return {
        id: l.id,
        title: l.title,
        highlightTags: l.highlight_tags ?? [],
        pages: lp,
      }
    })
    .filter((v: ProposeListing | null): v is ProposeListing => v != null)

  if (orderedListings.length === 0) notFound()

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <SwipeView
        proposalId={proposal.id}
        proposalSlug={slug}
        customerName={proposal.customer_name}
        listings={orderedListings}
        initialRanking={proposal.final_ranking ?? []}
        initialComment={proposal.ranking_comment ?? ''}
        completedAt={proposal.completed_at}
      />
      {/* Per-tenant GA: the proposal owner's own measurement id.
          The root layout already loads FANGO's platform GA, so events fire
          to both properties when this broker has their own GA configured. */}
      {ownerGaId && <GaScript measurementId={ownerGaId} />}
    </div>
  )
}
