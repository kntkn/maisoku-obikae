import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default async function UserListingsPage({
  params,
}: {
  params: Promise<{ userSlug: string }>
}) {
  const { userSlug } = await params
  const supabase = await createClient()

  // Get user by slug
  const { data: profile } = await supabase
    .from('company_profiles')
    .select('user_id')
    .eq('slug', userSlug)
    .single()

  if (!profile) notFound()

  // Get published listings with first page thumbnail
  const { data: listings } = await supabase
    .from('published_listings')
    .select(`
      id,
      title,
      slug,
      page_count,
      created_at,
      published_pages!inner (
        image_url,
        width,
        height
      )
    `)
    .eq('user_id', profile.user_id)
    .eq('is_published', true)
    .eq('published_pages.page_number', 1)
    .order('created_at', { ascending: false })

  if (!listings || listings.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">公開中の物件はありません</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">物件一覧</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {listings.map((listing) => {
          const thumbnail = Array.isArray(listing.published_pages)
            ? listing.published_pages[0]
            : listing.published_pages

          return (
            <Link
              key={listing.id}
              href={`/p/${userSlug}/${listing.slug}`}
              className="group block border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {thumbnail && (
                <div className="aspect-[3/4] relative bg-gray-100">
                  <Image
                    src={thumbnail.image_url}
                    alt={listing.title}
                    fill
                    className="object-cover group-hover:scale-[1.02] transition-transform"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-medium text-sm truncate">{listing.title}</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">{listing.page_count}ページ</p>
                  <p className="text-xs text-gray-400">
                    {new Date(listing.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
