'use client'

import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { PdfUploader } from '@/components/editor/pdf-uploader'
import { MaskControls } from '@/components/editor/mask-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { CompanyProfile } from '@/lib/database.types'
import type { MaskSettings, PageInfo, PageMaskSettings } from '@/types/editor'

// react-pdfを使うコンポーネントはサーバーで評価されないようdynamic importにする
const PdfViewer = dynamic(
  () => import('@/components/editor/pdf-viewer').then(mod => mod.PdfViewer),
  { ssr: false, loading: () => <div className="p-8 text-gray-500">PDFビューア読み込み中...</div> }
)

const PageList = dynamic(
  () => import('@/components/editor/page-list').then(mod => mod.PageList),
  { ssr: false, loading: () => <div className="p-4 text-gray-500">...</div> }
)

const PreviewEditor = dynamic(
  () => import('@/components/editor/preview-editor').then(mod => mod.PreviewEditor),
  { ssr: false, loading: () => <div className="p-8 text-gray-500">プレビュー読み込み中...</div> }
)

type EditorStep = 'upload' | 'edit' | 'preview'

// pdfjs の型定義（any で簡略化してSSR問題を回避）
type PdfjsType = {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<{ numPages: number }> }
}

export default function EditorPage() {
  const [step, setStep] = useState<EditorStep>('upload')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [maskSettings, setMaskSettings] = useState<PageMaskSettings>({})
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [pdfjsReady, setPdfjsReady] = useState(false)
  const pdfjsRef = useRef<PdfjsType | null>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const [pdfMaxWidth, setPdfMaxWidth] = useState<number>(0)

  const supabase = createClient()

  // PDFコンテナの幅を監視
  useEffect(() => {
    const updateWidth = () => {
      if (pdfContainerRef.current) {
        const width = pdfContainerRef.current.clientWidth - 32 // padding分を引く
        setPdfMaxWidth(width > 0 ? width : 0)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [step])

  // pdfjs を動的にロード（クライアントサイドのみ）
  useEffect(() => {
    let mounted = true
    console.log('[pdfjs] Starting to load react-pdf...')
    import('react-pdf').then((mod) => {
      console.log('[pdfjs] react-pdf loaded, mounted:', mounted)
      if (!mounted) return
      // CDNからworkerをロード（バージョンは動的に取得）
      const version = mod.pdfjs.version
      console.log('[pdfjs] version:', version)
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
      pdfjsRef.current = mod.pdfjs as unknown as PdfjsType
      setPdfjsReady(true)
      console.log('[pdfjs] Ready!')
    }).catch(err => {
      console.error('[pdfjs] Failed to load:', err)
    })
    return () => { mounted = false }
  }, [])

  // 会社情報を取得
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // ユーザーのメールアドレスを保存（ログ記録用）
        if (user.email) {
          setUserEmail(user.email)
        }

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
    if (!pdfjsReady || !pdfjsRef.current) {
      toast.error('PDFライブラリの読み込み中です。しばらくお待ちください。')
      return
    }

    const newPages: PageInfo[] = []
    const existingFileCount = new Set(pages.map(p => p.fileId)).size

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)  // Uint8Arrayに変換（detached対策）
      const fileId = `file-${Date.now()}-${fileIndex}`

      try {
        const pdf = await pdfjsRef.current.getDocument({ data: uint8Array.slice() }).promise
        const numPages = pdf.numPages

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageId = `${fileId}-page-${pageNum}`
          newPages.push({
            id: pageId,
            fileId,
            fileIndex: existingFileCount + fileIndex,
            pageNumber: pageNum,
            fileName: file.name,
            pdfData: uint8Array,  // Uint8Arrayを保存
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
  }, [pages.length, selectedPageId, pdfjsReady])

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

          <div ref={pdfContainerRef} className="flex-1 flex justify-center items-start overflow-auto py-4">
            {selectedPage && currentMaskSettings && pdfMaxWidth > 0 && (
              <PdfViewer
                pdfData={selectedPage.pdfData}
                pageNumber={selectedPage.pageNumber}
                maskSettings={currentMaskSettings}
                maxWidth={pdfMaxWidth}
              />
            )}
          </div>

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
          userEmail={userEmail}
          onBack={() => setStep('edit')}
        />
      )}
    </div>
  )
}
