'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import Link from 'next/link'
import type { ProposalSet, PublishedListing } from '@/lib/database.types'
import { getPublicBaseUrl } from '@/lib/public-url'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'proposal'
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<ProposalSet[]>([])
  const [listings, setListings] = useState<PublishedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [proposalsRes, listingsRes] = await Promise.all([
        supabase.from('proposal_sets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('published_listings').select('*').eq('user_id', user.id).eq('is_published', true).order('created_at', { ascending: false }),
      ])

      setProposals(proposalsRes.data || [])
      setListings(listingsRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!customerName.trim() || selectedIds.length === 0) return
    setCreating(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const slug = `${toSlug(customerName)}-${Date.now().toString(36)}`

      const { error } = await supabase.from('proposal_sets').insert({
        user_id: user.id,
        customer_name: customerName,
        slug,
        listing_ids: selectedIds,
      })

      if (error) throw new Error(error.message)

      toast.success('提案セットを作成しました')
      setShowCreate(false)
      setCustomerName('')
      setSelectedIds([])
      loadData()
    } catch (error) {
      toast.error('作成に失敗: ' + (error instanceof Error ? error.message : ''))
    } finally {
      setCreating(false)
    }
  }

  const copyUrl = async (slug: string) => {
    await navigator.clipboard.writeText(`${getPublicBaseUrl()}/propose/${slug}`)
    toast.success('URLをコピーしました')
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">読み込み中...</p></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">提案管理</h2>
          <p className="text-muted-foreground">顧客への物件提案セットを管理します</p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={listings.length === 0}>
          新規提案を作成
        </Button>
      </div>

      {listings.length === 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-amber-600">
              公開済みの物件がありません。まず帯替え編集から物件をWeb公開してください。
            </p>
          </CardContent>
        </Card>
      )}

      {proposals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">提案セットはまだありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{p.customer_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {p.listing_ids.length}物件 &middot; {new Date(p.created_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyUrl(p.slug)}>
                      URLコピー
                    </Button>
                    <Link href={`/proposals/${p.id}`}>
                      <Button variant="outline" size="sm">結果を見る</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新規提案セットを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>顧客名</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="田中太郎"
              />
            </div>
            <div className="space-y-2">
              <Label>物件を選択（{selectedIds.length}件選択中）</Label>
              <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y">
                {listings.map((listing) => (
                  <label
                    key={listing.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(listing.id)}
                      onChange={() => toggleSelect(listing.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{listing.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(listing.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !customerName.trim() || selectedIds.length === 0}
            >
              {creating ? '作成中...' : `${selectedIds.length}件で提案を作成`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
