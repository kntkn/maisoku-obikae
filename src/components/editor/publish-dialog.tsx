'use client'

import { useState } from 'react'
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

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pdfParams: GeneratePdfParams
  defaultTitle: string
  userEmail?: string
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

export function PublishDialog({
  open,
  onOpenChange,
  pdfParams,
  defaultTitle,
}: PublishDialogProps) {
  const [step, setStep] = useState<PublishStep>('form')
  const [title, setTitle] = useState(defaultTitle)
  const [progress, setProgress] = useState('')
  const [publicUrl, setPublicUrl] = useState('')

  const handlePublish = async () => {
    setStep('publishing')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      // Check user has a slug set
      const { data: profile } = await supabase
        .from('company_profiles')
        .select('slug')
        .eq('user_id', user.id)
        .single()

      if (!profile?.slug) {
        toast.error('先に設定ページで公開URLスラッグを設定してください')
        setStep('form')
        return
      }

      // Step 1: Generate modified PDF
      setProgress('PDF生成中...')
      const pdfBytes = await generateModifiedPdf(pdfParams)

      // Step 2: Render PDF to images
      setProgress('画像変換中...')
      const images = await renderPdfToImages(pdfBytes)

      // Step 3: Create listing record
      setProgress('データ保存中...')
      const listingSlug = `${toSlug(title)}-${Date.now().toString(36)}`

      const { data: listing, error: listingError } = await supabase
        .from('published_listings')
        .insert({
          user_id: user.id,
          title,
          slug: listingSlug,
          page_count: images.length,
        })
        .select()
        .single()

      if (listingError || !listing) throw new Error(listingError?.message || 'リスト作成に失敗しました')

      // Step 4: Upload images to Supabase Storage
      setProgress(`画像アップロード中... (0/${images.length})`)

      const pageRecords = []

      for (const img of images) {
        const filePath = `${user.id}/${listing.id}/${img.pageNumber}.png`

        const { error: uploadError } = await supabase.storage
          .from('published')
          .upload(filePath, img.blob, {
            contentType: 'image/png',
            upsert: true,
          })

        if (uploadError) throw new Error(`画像アップロード失敗: ${uploadError.message}`)

        const { data: { publicUrl: imageUrl } } = supabase.storage
          .from('published')
          .getPublicUrl(filePath)

        pageRecords.push({
          listing_id: listing.id,
          page_number: img.pageNumber,
          image_url: imageUrl,
          width: img.width,
          height: img.height,
        })

        setProgress(`画像アップロード中... (${img.pageNumber}/${images.length})`)
      }

      // Step 5: Save page records
      setProgress('ページ情報を保存中...')
      const { error: pagesError } = await supabase
        .from('published_pages')
        .insert(pageRecords)

      if (pagesError) throw new Error(`ページ保存失敗: ${pagesError.message}`)

      // Done
      const url = `${window.location.origin}/p/${profile.slug}/${listingSlug}`
      setPublicUrl(url)
      setStep('done')
      toast.success('Web公開が完了しました')
    } catch (error) {
      console.error('Publish error:', error)
      toast.error('公開に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
      setStep('form')
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl)
    toast.success('URLをコピーしました')
  }

  const handleClose = () => {
    if (step !== 'publishing') {
      setStep('form')
      setTitle(defaultTitle)
      setProgress('')
      setPublicUrl('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? '公開完了' : 'マイソクをWebに公開'}
          </DialogTitle>
          {step === 'form' && (
            <DialogDescription>
              帯替え済みマイソクをWebページとして公開します
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'form' && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="物件名やファイル名"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                キャンセル
              </Button>
              <Button onClick={handlePublish} disabled={!title.trim()}>
                公開する
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
              <p className="text-sm text-muted-foreground">
                公開URLが発行されました。このURLを共有してください。
              </p>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="text-xs" />
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  コピー
                </Button>
              </div>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                公開ページを開く
              </a>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>閉じる</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
