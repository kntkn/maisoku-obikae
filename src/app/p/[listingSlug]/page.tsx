import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { GaScript } from '@/components/public/ga-script'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ listingSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listingSlug } = await params
  const supabase = await createClient()

  const { data: listing } = await supabase
    .from('published_listings')
    .select('id, title, user_id')
    .eq('slug', listingSlug)
    .eq('is_published', true)
    .single()

  if (!listing) return { title: 'Not Found' }

  const { data: profile } = await supabase
    .from('company_profiles')
    .select('company_name')
    .eq('user_id', listing.user_id)
    .single()

  // Get first page image for OGP
  const { data: firstPage } = await supabase
    .from('published_pages')
    .select('image_url, width, height')
    .eq('listing_id', listing.id)
    .eq('page_number', 1)
    .single()

  const title = listing.title
  const description = profile?.company_name
    ? `${profile.company_name} - ${listing.title}`
    : listing.title

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      ...(firstPage && {
        images: [{
          url: firstPage.image_url,
          width: firstPage.width || 1200,
          height: firstPage.height || 1600,
        }],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(firstPage && {
        images: [firstPage.image_url],
      }),
    },
  }
}

export default async function ListingPage({ params }: Props) {
  const { listingSlug } = await params
  const supabase = await createClient()

  const { data: listing } = await supabase
    .from('published_listings')
    .select('id, title, page_count, created_at, user_id, ga_measurement_id')
    .eq('slug', listingSlug)
    .eq('is_published', true)
    .single()

  if (!listing) notFound()

  const { data: profile } = await supabase
    .from('company_profiles')
    .select('company_name, ga_measurement_id')
    .eq('user_id', listing.user_id)
    .single()

  const { data: pages } = await supabase
    .from('published_pages')
    .select('page_number, image_url, width, height')
    .eq('listing_id', listing.id)
    .order('page_number', { ascending: true })

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
                alt={listing.title}
                width={page.width || 1200}
                height={page.height || 1600}
                className="w-full h-auto"
                sizes="(max-width: 1024px) 100vw, 800px"
                priority
              />
            </div>
          ))}
        </div>
      </main>

      {gaId && <GaScript measurementId={gaId} />}
    </div>
  )
}
