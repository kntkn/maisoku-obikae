import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { GaScript } from '@/components/public/ga-script'

export default async function ListingPage({
  params,
}: {
  params: Promise<{ listingSlug: string }>
}) {
  const { listingSlug } = await params
  const supabase = await createClient()

  // Get listing with company info
  const { data: listing } = await supabase
    .from('published_listings')
    .select('id, title, page_count, created_at, user_id, ga_measurement_id')
    .eq('slug', listingSlug)
    .eq('is_published', true)
    .single()

  if (!listing) notFound()

  // Get company name for header
  const { data: profile } = await supabase
    .from('company_profiles')
    .select('company_name, ga_measurement_id')
    .eq('user_id', listing.user_id)
    .single()

  // Get all pages
  const { data: pages } = await supabase
    .from('published_pages')
    .select('page_number, image_url, width, height')
    .eq('listing_id', listing.id)
    .order('page_number', { ascending: true })

  // Use listing-level GA ID, fallback to user-level
  const gaId = listing.ga_measurement_id || profile?.ga_measurement_id

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">
            {listing.title}
          </h1>
          {profile?.company_name && (
            <p className="text-sm text-gray-500">{profile.company_name}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-4">
          {pages?.map((page) => (
            <div key={page.page_number} className="border rounded-lg overflow-hidden">
              <Image
                src={page.image_url}
                alt={`${listing.title} - ページ ${page.page_number}`}
                width={page.width || 1200}
                height={page.height || 1600}
                className="w-full h-auto"
                sizes="(max-width: 1024px) 100vw, 800px"
                priority={page.page_number === 1}
              />
            </div>
          ))}
        </div>
      </main>

      {gaId && <GaScript measurementId={gaId} />}
    </div>
  )
}
