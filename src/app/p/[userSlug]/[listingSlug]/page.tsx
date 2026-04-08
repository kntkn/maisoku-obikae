import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ userSlug: string; listingSlug: string }>
}) {
  const { userSlug, listingSlug } = await params
  const supabase = await createClient()

  // Get user by slug
  const { data: profile } = await supabase
    .from('company_profiles')
    .select('user_id')
    .eq('slug', userSlug)
    .single()

  if (!profile) notFound()

  // Get listing
  const { data: listing } = await supabase
    .from('published_listings')
    .select('id, title, page_count, created_at')
    .eq('user_id', profile.user_id)
    .eq('slug', listingSlug)
    .eq('is_published', true)
    .single()

  if (!listing) notFound()

  // Get all pages
  const { data: pages } = await supabase
    .from('published_pages')
    .select('page_number, image_url, width, height')
    .eq('listing_id', listing.id)
    .order('page_number', { ascending: true })

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/p/${userSlug}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; 一覧に戻る
        </Link>
        <h2 className="text-xl font-semibold mt-2">{listing.title}</h2>
        <p className="text-sm text-gray-500">
          {listing.page_count}ページ &middot; {new Date(listing.created_at).toLocaleDateString('ja-JP')}
        </p>
      </div>

      <div className="space-y-4">
        {pages?.map((page) => (
          <div key={page.page_number} className="border rounded-lg overflow-hidden">
            <Image
              src={page.image_url}
              alt={`${listing.title} - ページ ${page.page_number}`}
              width={page.width || 1200}
              height={page.height || 1600}
              className="w-full h-auto"
              sizes="(max-width: 1024px) 100vw, 960px"
              priority={page.page_number === 1}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
