'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import type { PublishedListing } from '@/lib/database.types'
import { getPublicBaseUrl } from '@/lib/public-url'
import { TagEditorDialog } from '@/components/listings/tag-editor-dialog'

export default function PublishedPage() {
  const [listings, setListings] = useState<PublishedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [userSlug, setUserSlug] = useState<string | null>(null)
  const [tagEditing, setTagEditing] = useState<PublishedListing | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('company_profiles')
        .select('slug')
        .eq('user_id', user.id)
        .single()

      setUserSlug(profile?.slug || null)

      const { data, error } = await supabase
        .from('published_listings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading listings:', error)
        return
      }

      setListings(data || [])
    } finally {
      setLoading(false)
    }
  }

  const togglePublish = async (listing: PublishedListing) => {
    const { error } = await supabase
      .from('published_listings')
      .update({ is_published: !listing.is_published })
      .eq('id', listing.id)

    if (error) {
      toast.error('更新に失敗しました')
      return
    }

    setListings(prev =>
      prev.map(l => l.id === listing.id ? { ...l, is_published: !l.is_published } : l)
    )
    toast.success(listing.is_published ? '非公開にしました' : '公開しました')
  }

  const deleteListing = async (listing: PublishedListing) => {
    if (!confirm(`「${listing.title}」を削除しますか？この操作は取り消せません。`)) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Delete images from storage
    const { data: pages } = await supabase
      .from('published_pages')
      .select('page_number')
      .eq('listing_id', listing.id)

    if (pages) {
      const filePaths = pages.map(p => `${user.id}/${listing.id}/${p.page_number}.png`)
      await supabase.storage.from('published').remove(filePaths)
    }

    // Delete listing (cascades to pages)
    const { error } = await supabase
      .from('published_listings')
      .delete()
      .eq('id', listing.id)

    if (error) {
      toast.error('削除に失敗しました')
      return
    }

    setListings(prev => prev.filter(l => l.id !== listing.id))
    toast.success('削除しました')
  }

  const copyUrl = async (listing: PublishedListing) => {
    const url = `${getPublicBaseUrl()}/p/${listing.slug}`
    await navigator.clipboard.writeText(url)
    toast.success('URLをコピーしました')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">公開ページ管理</h2>
        <p className="text-muted-foreground">
          Web公開したマイソクの一覧です
        </p>
      </div>

      {!userSlug && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-amber-600">
              公開URLスラッグが未設定です。設定ページで設定してください。
            </p>
          </CardContent>
        </Card>
      )}

      {listings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">公開済みのマイソクはありません</p>
            <p className="text-sm text-muted-foreground mt-1">
              帯替え編集画面の「Web公開」ボタンから公開できます
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <Card key={listing.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{listing.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        listing.is_published
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {listing.is_published ? '公開中' : '非公開'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {listing.page_count}ページ &middot; {new Date(listing.created_at).toLocaleDateString('ja-JP')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(listing.highlight_tags ?? []).length === 0 ? (
                        <span className="text-xs text-gray-400">タグ未設定</span>
                      ) : (
                        (listing.highlight_tags ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                          >
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTagEditing(listing)}
                    >
                      タグ編集
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyUrl(listing)}
                      disabled={!userSlug}
                    >
                      URLコピー
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePublish(listing)}
                    >
                      {listing.is_published ? '非公開にする' : '公開する'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => deleteListing(listing)}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tagEditing && (
        <TagEditorDialog
          open={!!tagEditing}
          onOpenChange={(open) => { if (!open) setTagEditing(null) }}
          listingId={tagEditing.id}
          listingTitle={tagEditing.title}
          initialTags={tagEditing.highlight_tags ?? []}
          onSaved={(tags) => {
            setListings((prev) =>
              prev.map((l) => (l.id === tagEditing.id ? { ...l, highlight_tags: tags } : l)),
            )
          }}
        />
      )}
    </div>
  )
}
