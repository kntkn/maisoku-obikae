import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SwipeView } from './swipe-view'
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
    .select('id, customer_name, listing_ids')
    .eq('slug', slug)
    .single()

  if (!proposal) notFound()

  // Fetch listings with their first page image
  const { data: listings } = await supabase
    .from('published_listings')
    .select('id, title')
    .in('id', proposal.listing_ids)

  if (!listings || listings.length === 0) notFound()

  // Fetch first page image for each listing
  const listingImages = await Promise.all(
    proposal.listing_ids.map(async (listingId: string) => {
      const listing = listings.find(l => l.id === listingId)
      if (!listing) return null

      const { data: page } = await supabase
        .from('published_pages')
        .select('image_url, width, height')
        .eq('listing_id', listingId)
        .eq('page_number', 1)
        .single()

      return page ? {
        listingId: listing.id,
        title: listing.title,
        imageUrl: page.image_url,
      } : null
    })
  )

  const items = listingImages.filter(Boolean) as {
    listingId: string
    title: string
    imageUrl: string
  }[]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <SwipeView
        proposalId={proposal.id}
        proposalSlug={slug}
        customerName={proposal.customer_name}
        items={items}
      />
      <GaScript measurementId="G-664C460Z2V" />
    </div>
  )
}
