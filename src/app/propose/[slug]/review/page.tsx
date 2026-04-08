import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { GaScript } from '@/components/public/ga-script'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: proposal } = await supabase
    .from('proposal_sets')
    .select('id, customer_name, listing_ids')
    .eq('slug', slug)
    .single()

  if (!proposal) notFound()

  // Get liked results
  const { data: results } = await supabase
    .from('swipe_results')
    .select('listing_id, liked, viewed_seconds')
    .eq('proposal_id', proposal.id)
    .eq('liked', true)

  const likedIds = results?.map(r => r.listing_id) || []

  // Get listing details + images for liked ones
  let likedListings: { id: string; title: string; imageUrl: string; viewedSeconds: number }[] = []

  if (likedIds.length > 0) {
    const { data: listings } = await supabase
      .from('published_listings')
      .select('id, title')
      .in('id', likedIds)

    if (listings) {
      likedListings = await Promise.all(
        listings.map(async (listing) => {
          const { data: page } = await supabase
            .from('published_pages')
            .select('image_url')
            .eq('listing_id', listing.id)
            .eq('page_number', 1)
            .single()

          const result = results?.find(r => r.listing_id === listing.id)

          return {
            id: listing.id,
            title: listing.title,
            imageUrl: page?.image_url || '',
            viewedSeconds: result?.viewed_seconds || 0,
          }
        })
      )
    }
  }

  const totalResults = await supabase
    .from('swipe_results')
    .select('id', { count: 'exact' })
    .eq('proposal_id', proposal.id)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">
            {proposal.customer_name}様の気になる物件
          </h1>
          <p className="text-sm text-gray-500">
            {likedListings.length}件 / {totalResults.count || proposal.listing_ids.length}件中
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {likedListings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">気になる物件はまだありません</p>
            <Link
              href={`/propose/${slug}`}
              className="inline-block mt-4 text-blue-600 hover:underline"
            >
              もう一度スワイプする
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {likedListings.map((listing) => (
              <Link
                key={listing.id}
                href={`/p/${listing.id}`}
                className="group block border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="aspect-[3/4] relative bg-gray-100">
                  <Image
                    src={listing.imageUrl}
                    alt={listing.title}
                    fill
                    className="object-cover group-hover:scale-[1.02] transition-transform"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate">{listing.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <GaScript measurementId="G-664C460Z2V" />
    </div>
  )
}
