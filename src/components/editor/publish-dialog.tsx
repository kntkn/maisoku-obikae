'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { generateModifiedPdf, type GeneratePdfParams } from '@/lib/pdf-generator'
import { renderPdfToImages } from '@/lib/pdf-to-images'
import { getPublicBaseUrl } from '@/lib/public-url'

export interface ObikaeEmbedContext {
  sessionId: string
  customerName: string
  parentOrigin: string
}

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pdfParams: GeneratePdfParams
  defaultTitle: string
  userEmail?: string
  embedContext?: ObikaeEmbedContext | null
}

type PublishStep = 'form' | 'publishing' | 'done'

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'listing'
}

function toProposalSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'proposal'
}

interface PublishedItem {
  title: string
  url: string
  listingId: string
}

export function PublishDialog({
  open,
  onOpenChange,
  pdfParams,
  defaultTitle,
  embedContext,
}: PublishDialogProps) {
  const [step, setStep] = useState<PublishStep>('form')
  const [title, setTitle] = useState(defaultTitle)
  const [progress, setProgress] = useState('')
  const [publishedItems, setPublishedItems] = useState<PublishedItem[]>([])
  const [proposeUrl, setProposeUrl] = useState<string | null>(null)

  const isEmbed = !!embedContext

  // In embed mode, swap the default title to something customer-specific.
  useEffect(() => {
    if (isEmbed && embedContext?.customerName) {
      setTitle(
        `${embedContext.customerName}様向け ${new Date().toLocaleDateString('ja-JP')}`
      )
    }
  }, [isEmbed, embedContext?.customerName])

  const GA_MEASUREMENT_ID = 'G-664C460Z2V'

  const handlePublish = async () => {
    setStep('publishing')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      // Step 1: Generate modified PDF
      setProgress('PDF生成中...')
      const pdfBytes = await generateModifiedPdf(pdfParams)

      // Step 2: Render PDF to images
      setProgress('画像変換中...')
      const images = await renderPdfToImages(pdfBytes)

      // Step 3: Create one listing per page (1 property = 1 URL)
      const items: PublishedItem[] = []
      const baseSlug = toSlug(title)
      const timestamp = Date.now().toString(36)

      for (const img of images) {
        const itemTitle = images.length > 1
          ? `${title} (${img.pageNumber}/${images.length})`
          : title
        const listingSlug = images.length > 1
          ? `${baseSlug}-${img.pageNumber}-${timestamp}`
          : `${baseSlug}-${timestamp}`

        setProgress(`物件 ${img.pageNumber}/${images.length} を公開中...`)

        // Create listing
        const { data: listing, error: listingError } = await supabase
          .from('published_listings')
          .insert({
            user_id: user.id,
            title: itemTitle,
            slug: listingSlug,
            page_count: 1,
            ga_measurement_id: GA_MEASUREMENT_ID,
          })
          .select()
          .single()

        if (listingError || !listing) throw new Error(listingError?.message || 'リスト作成に失敗')

        // Upload image
        const filePath = `${user.id}/${listing.id}/1.png`
        const { error: uploadError } = await supabase.storage
          .from('published')
          .upload(filePath, img.blob, { contentType: 'image/png', upsert: true })

        if (uploadError) throw new Error(`画像アップロード失敗: ${uploadError.message}`)

        const { data: { publicUrl: imageUrl } } = supabase.storage
          .from('published')
          .getPublicUrl(filePath)

        // Save page record
        const { error: pageError } = await supabase
          .from('published_pages')
          .insert({
            listing_id: listing.id,
            page_number: 1,
            image_url: imageUrl,
            width: img.width,
            height: img.height,
          })

        if (pageError) throw new Error(`ページ保存失敗: ${pageError.message}`)

        items.push({
          title: itemTitle,
          url: `${getPublicBaseUrl()}/p/${listingSlug}`,
          listingId: listing.id,
        })
      }

      setPublishedItems(items)

      // In embed mode, auto-create a proposal_set bundling the published listings
      // so that the parent window (sales-ai-mockup) can paste a single URL into chat.
      if (isEmbed && embedContext) {
        try {
          setProgress('提案セットを作成中...')
          const proposalSlug = `${toProposalSlug(embedContext.customerName)}-${Date.now().toString(36)}`
          const { data: proposal, error: proposalError } = await supabase
            .from('proposal_sets')
            .insert({
              user_id: user.id,
              customer_name: embedContext.customerName,
              slug: proposalSlug,
              listing_ids: items.map((i) => i.listingId),
            })
            .select('id, slug')
            .single()

          if (proposalError || !proposal) {
            throw new Error(proposalError?.message ?? '提案セットの作成に失敗しました')
          }

          const createdProposeUrl = `${getPublicBaseUrl()}/propose/${proposal.slug}`
          setProposeUrl(createdProposeUrl)

          // Mark the obikae session as completed (fire-and-forget is fine)
          fetch(`/api/obikae/session/${embedContext.sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proposalId: proposal.id }),
          }).catch((err) => console.error('[obikae/session PATCH] fire-and-forget failed:', err))

          // Notify the opener window (sales-ai-mockup) so it can paste the URL
          // into chat. `window.opener` is the creator for popup windows (in
          // iframes we'd use window.parent, but this flow is popup-only).
          try {
            const targetOrigin =
              embedContext.parentOrigin && embedContext.parentOrigin !== '*'
                ? embedContext.parentOrigin
                : '*'
            const message = {
              type: 'obikae:done',
              sessionId: embedContext.sessionId,
              proposeUrl: createdProposeUrl,
              customerName: embedContext.customerName,
              listings: items.map((i) => ({ title: i.title, url: i.url })),
            }
            // Try opener first (popup), fall back to parent (iframe).
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(message, targetOrigin)
            } else if (window.parent && window.parent !== window) {
              window.parent.postMessage(message, targetOrigin)
            } else {
              console.warn('[publish] no opener/parent window to notify')
            }
          } catch (err) {
            console.error('[publish] postMessage failed:', err)
          }
        } catch (err) {
          console.error('Proposal creation error:', err)
          toast.error(
            '提案セットの作成に失敗しました: ' +
              (err instanceof Error ? err.message : '不明なエラー')
          )
        }
      }

      setStep('done')
      toast.success(`${items.length}件の物件を公開しました`)
    } catch (error) {
      console.error('Publish error:', error)
      toast.error('公開に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
      setStep('form')
    }
  }

  const handleCopyAll = async () => {
    const text = publishedItems.map(item => `${item.title}\n${item.url}`).join('\n\n')
    await navigator.clipboard.writeText(text)
    toast.success('全URLをコピーしました')
  }

  const handleCopyOne = async (url: string) => {
    await navigator.clipboard.writeText(url)
    toast.success('URLをコピーしました')
  }

  const handleCopyProposeUrl = async () => {
    if (!proposeUrl) return
    await navigator.clipboard.writeText(proposeUrl)
    toast.success('提案URLをコピーしました')
  }

  const handleSendBack = () => {
    if (!isEmbed || !embedContext || !proposeUrl) return
    try {
      const targetOrigin =
        embedContext.parentOrigin && embedContext.parentOrigin !== '*'
          ? embedContext.parentOrigin
          : '*'
      const message = {
        type: 'obikae:done',
        sessionId: embedContext.sessionId,
        proposeUrl,
        customerName: embedContext.customerName,
        listings: publishedItems.map((i) => ({ title: i.title, url: i.url })),
        closeRequested: true,
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, targetOrigin)
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, targetOrigin)
      }
    } catch (err) {
      console.error('[publish] send-back postMessage failed:', err)
    }
  }

  const handleClose = () => {
    if (step !== 'publishing') {
      setStep('form')
      setProgress('')
      setPublishedItems([])
      setProposeUrl(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'done' ? 'max-w-2xl' : ''}>
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? '公開完了' : 'マイソクをWebに公開'}
          </DialogTitle>
          {step === 'form' && (
            <DialogDescription>
              各ページを個別のWebページとして公開します（{pdfParams.pages.length}物件）
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'form' && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル（ベース名）</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="物件名やファイル名"
                />
                <p className="text-xs text-muted-foreground">
                  {pdfParams.pages.length}件の物件ページが個別に公開されます
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                キャンセル
              </Button>
              <Button onClick={handlePublish} disabled={!title.trim()}>
                {pdfParams.pages.length}件を公開する
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'publishing' && (
          <div className="py-8 text-center space-y-4">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">{progress}</p>
          </div>
        )}

        {step === 'done' && (
          <>
            <div className="space-y-4">
              {isEmbed && proposeUrl && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-green-900">
                    ✅ 提案URLを生成しました
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={proposeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate flex-1"
                    >
                      {proposeUrl}
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={handleCopyProposeUrl}
                    >
                      URLコピー
                    </Button>
                  </div>
                  <p className="text-xs text-green-800">
                    営業AIのチャット欄にこのリンクが自動挿入されています。「閉じる」を押すとこの画面は閉じます。
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {publishedItems.length}件の物件ページを公開しました
                </p>
                <Button variant="outline" size="sm" onClick={handleCopyAll}>
                  全URLコピー
                </Button>
              </div>
              <div className="max-h-[320px] overflow-y-auto space-y-2">
                {publishedItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-500 w-6 text-right flex-shrink-0">{i + 1}.</span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate flex-1"
                    >
                      {item.url}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-7 px-2"
                      onClick={() => handleCopyOne(item.url)}
                    >
                      コピー
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              {isEmbed && proposeUrl ? (
                <>
                  <Button variant="outline" onClick={handleClose}>
                    編集に戻る
                  </Button>
                  <Button onClick={handleSendBack}>営業AIに戻る</Button>
                </>
              ) : (
                <Button onClick={handleClose}>閉じる</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
