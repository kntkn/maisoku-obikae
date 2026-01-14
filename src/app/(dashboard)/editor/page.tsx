'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadPdf } from '@/lib/pdf'
import { PdfUploader } from '@/components/editor/pdf-uploader'
import { PdfViewer, type MaskSettings } from '@/components/editor/pdf-viewer'
import { MaskControls } from '@/components/editor/mask-controls'
import { PageList, type PageInfo } from '@/components/editor/page-list'
import { PreviewEditor } from '@/components/editor/preview-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { CompanyProfile } from '@/lib/database.types'

type EditorStep = 'upload' | 'edit' | 'preview'

interface PageMaskSettings {
  [pageId: string]: MaskSettings
}

export default function EditorPage() {
  const [step, setStep] = useState<EditorStep>('upload')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [maskSettings, setMaskSettings] = useState<PageMaskSettings>({})
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const supabase = createClient()

  // 会社情報を取得
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('company_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error)
          return
        }

        if (data) {
          setCompanyProfile(data)
        }
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoadingProfile(false)
      }
    }

    loadProfile()
  }, [])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    const newPages: PageInfo[] = []
    const existingFileCount = new Set(pages.map(p => p.fileId)).size

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]
      const arrayBuffer = await file.arrayBuffer()
      const fileId = `file-${Date.now()}-${fileIndex}`

      try {
        const pdf = await loadPdf(arrayBuffer)
        const numPages = pdf.numPages

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageId = `${fileId}-page-${pageNum}`
          newPages.push({
            id: pageId,
            fileId,
            fileIndex: existingFileCount + fileIndex,
            pageNumber: pageNum,
            fileName: file.name,
            pdfData: arrayBuffer,
            status: 'pending',
          })
        }
      } catch (error) {
        console.error('PDF parse error:', error)
        toast.error(`${file.name} の読み込みに失敗しました`)
      }
    }

    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages])
      const newMaskSettings: PageMaskSettings = {}
      newPages.forEach((page) => {
        newMaskSettings[page.id] = {
          bottomHeight: 100,
          leftWidth: 0,
          enableLShape: false,
        }
      })
      setMaskSettings((prev) => ({ ...prev, ...newMaskSettings }))

      if (!selectedPageId) {
        setSelectedPageId(newPages[0].id)
      }
      setStep('edit')
    }
  }, [pages.length, selectedPageId])

  const handleMaskChange = useCallback(
    (newSettings: MaskSettings) => {
      if (!selectedPageId) return
      setMaskSettings((prev) => ({
        ...prev,
        [selectedPageId]: newSettings,
      }))
    },
    [selectedPageId]
  )

  const handleConfirmPage = useCallback(() => {
    if (!selectedPageId) return

    setPages((prev) =>
      prev.map((page) =>
        page.id === selectedPageId ? { ...page, status: 'done' } : page
      )
    )

    // 次の未完了ページを選択
    const currentIndex = pages.findIndex((p) => p.id === selectedPageId)
    const nextPage = pages.find(
      (p, i) => i > currentIndex && p.status !== 'done'
    )
    if (nextPage) {
      setSelectedPageId(nextPage.id)
    }
  }, [selectedPageId, pages])

  const handleSelectPage = useCallback((id: string) => {
    setSelectedPageId(id)
    setPages((prev) =>
      prev.map((page) => {
        if (page.id === id && page.status === 'pending') {
          return { ...page, status: 'editing' }
        }
        if (page.id !== id && page.status === 'editing') {
          return { ...page, status: 'pending' }
        }
        return page
      })
    )
  }, [])

  const handleGoToPreview = () => {
    if (!companyProfile) {
      toast.error('会社情報を登録してください')
      return
    }
    setStep('preview')
  }

  const selectedPage = pages.find((p) => p.id === selectedPageId)
  const currentMaskSettings = selectedPageId
    ? maskSettings[selectedPageId]
    : null

  const completedCount = pages.filter((p) => p.status === 'done').length
  const allCompleted = pages.length > 0 && completedCount === pages.length

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {step !== 'preview' && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">帯替え編集</h2>
            <p className="text-muted-foreground">
              PDFをアップロードして白塗り範囲を調整します
            </p>
          </div>
          {pages.length > 0 && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {completedCount} / {pages.length} 完了
              </span>
              {allCompleted && (
                <Button onClick={handleGoToPreview}>
                  プレビュー・出力へ
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {!companyProfile && step !== 'preview' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <p className="text-sm text-yellow-800">
              会社情報が登録されていません。
              <a href="/settings" className="underline font-medium ml-1">
                設定画面で登録してください
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'upload' && (
        <PdfUploader onFilesSelected={handleFilesSelected} />
      )}

      {step === 'edit' && (
        <div className="flex gap-4">
          {/* 左サイドバー: ページリスト */}
          <div className="w-48 flex-shrink-0">
            <Card>
              <CardContent className="p-3">
                <PageList
                  pages={pages}
                  selectedPageId={selectedPageId}
                  onSelectPage={handleSelectPage}
                />
                <div className="mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      document.getElementById('add-more-pdf')?.click()
                    }}
                  >
                    + PDFを追加
                  </Button>
                  <input
                    id="add-more-pdf"
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      if (files.length > 0) {
                        handleFilesSelected(files)
                      }
                      e.target.value = ''
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* メインエリア: PDFビューア（大きく中央配置） */}
          <div className="flex-1 flex justify-center overflow-auto">
            {selectedPage && currentMaskSettings && (
              <PdfViewer
                pdfData={selectedPage.pdfData}
                pageNumber={selectedPage.pageNumber}
                maskSettings={currentMaskSettings}
                scale={2.0}
              />
            )}
          </div>

          {/* 右サイドバー: コントロール */}
          <div className="w-64 flex-shrink-0 space-y-4">
            {currentMaskSettings && (
              <>
                <MaskControls
                  settings={currentMaskSettings}
                  onChange={handleMaskChange}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">操作</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      onClick={handleConfirmPage}
                      className="w-full"
                      disabled={selectedPage?.status === 'done'}
                    >
                      {selectedPage?.status === 'done'
                        ? '確定済み'
                        : 'この物件を確定'}
                    </Button>
                    {selectedPage?.status === 'done' && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPages((prev) =>
                            prev.map((page) =>
                              page.id === selectedPageId
                                ? { ...page, status: 'editing' }
                                : page
                            )
                          )
                        }}
                        className="w-full"
                      >
                        編集し直す
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'preview' && (
        <PreviewEditor
          pages={pages}
          maskSettings={maskSettings}
          companyProfile={companyProfile}
          onBack={() => setStep('edit')}
        />
      )}
    </div>
  )
}
