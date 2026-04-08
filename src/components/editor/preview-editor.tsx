'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { BlockEditor, createInitialBlocks } from './block-editor'
import { BlockProperties } from './block-properties'
import { PublishDialog } from './publish-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { generateModifiedPdf } from '@/lib/pdf-generator'
import type { CompanyProfile, Block } from '@/lib/database.types'
import type { MaskSettings, PageInfo } from '@/types/editor'

// react-pdfをクライアントサイドのみでロード
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false, loading: () => <div className="p-8 text-gray-500">読み込み中...</div> }
)

const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
)

interface PreviewEditorProps {
  pages: PageInfo[]
  maskSettings: { [pageId: string]: MaskSettings }
  companyProfile: CompanyProfile | null
  userEmail?: string
  onBack: () => void
}


export function PreviewEditor({
  pages,
  maskSettings,
  companyProfile,
  userEmail,
  onBack,
}: PreviewEditorProps) {
  const [pageDimensions, setPageDimensions] = useState<{ [pageId: string]: { width: number; height: number } }>({})
  const [pageScales, setPageScales] = useState<{ [pageId: string]: number }>({})
  const [originalPageSizes, setOriginalPageSizes] = useState<{ [pageId: string]: { width: number; height: number } }>({})
  const [blocks, setBlocks] = useState<{ [pageId: string]: Block[] }>({})
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [maxWidth, setMaxWidth] = useState(0)

  // worker設定をuseEffect内で実行
  useEffect(() => {
    import('react-pdf').then((mod) => {
      const version = mod.pdfjs.version
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
      setIsReady(true)
    })
  }, [])

  // コンテナ幅を監視
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth - 32
        setMaxWidth(width > 0 ? width : 0)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // 各ページのfileオブジェクトをメモ化
  const pageFiles = useMemo(
    () => pages.reduce((acc, page) => {
      acc[page.id] = { data: page.pdfData.slice() }
      return acc
    }, {} as { [pageId: string]: { data: Uint8Array } }),
    [pages]
  )

  // ページごとのロード成功ハンドラを生成
  const createPageLoadHandler = useCallback(
    (pageId: string, mask: MaskSettings) => (pageInfo: { width: number; height: number }) => {
      const currentScale = pageScales[pageId] || 1.0
      const origWidth = pageInfo.width / currentScale
      const origHeight = pageInfo.height / currentScale

      // 元のサイズを保存（まだ保存されていない場合）
      if (!originalPageSizes[pageId]) {
        setOriginalPageSizes((prev) => ({
          ...prev,
          [pageId]: { width: origWidth, height: origHeight }
        }))

        // maxWidthに基づいて適切なスケールを計算
        if (maxWidth > 0 && origWidth > maxWidth) {
          const newScale = maxWidth / origWidth
          setPageScales((prev) => ({ ...prev, [pageId]: newScale }))
          return // 新しいスケールで再レンダリングされる
        }
      }

      setPageDimensions((prev) => ({
        ...prev,
        [pageId]: { width: pageInfo.width, height: pageInfo.height }
      }))

      // 初期ブロックがなければ生成
      setBlocks((prev) => {
        if (prev[pageId]) return prev
        const scale = pageScales[pageId] || 1.0
        const initialBlocks = createInitialBlocks(
          pageInfo.width,
          pageInfo.height,
          mask.bottomHeight * scale,
          mask.leftWidth * scale,
          mask.enableLShape,
          companyProfile
        )
        return { ...prev, [pageId]: initialBlocks }
      })
    },
    [pageScales, originalPageSizes, maxWidth, companyProfile]
  )

  // ページごとのブロック変更ハンドラを生成
  const createBlocksChangeHandler = useCallback(
    (pageId: string) => (newBlocks: Block[]) => {
      setBlocks((prev) => ({ ...prev, [pageId]: newBlocks }))
    },
    []
  )

  // 選択中ブロックの更新（全ページから検索）
  const handleBlockUpdate = useCallback(
    (updatedBlock: Block) => {
      // どのページに属するブロックか検索
      for (const pageId of Object.keys(blocks)) {
        const pageBlocks = blocks[pageId]
        if (pageBlocks?.some((b) => b.id === updatedBlock.id)) {
          setBlocks((prev) => ({
            ...prev,
            [pageId]: (prev[pageId] || []).map((b) =>
              b.id === updatedBlock.id ? updatedBlock : b
            ),
          }))
          return
        }
      }
    },
    [blocks]
  )

  // 選択中ブロックの削除（全ページから検索）
  const handleBlockDelete = useCallback(
    (id: string) => {
      for (const pageId of Object.keys(blocks)) {
        const pageBlocks = blocks[pageId]
        if (pageBlocks?.some((b) => b.id === id)) {
          setBlocks((prev) => ({
            ...prev,
            [pageId]: (prev[pageId] || []).filter((b) => b.id !== id),
          }))
          setSelectedBlockId(null)
          return
        }
      }
    },
    [blocks]
  )

  // 選択中ブロックを全ページから検索
  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null
    for (const pageId of Object.keys(blocks)) {
      const found = blocks[pageId]?.find((b) => b.id === selectedBlockId)
      if (found) return found
    }
    return null
  }, [selectedBlockId, blocks])

  // ファイルをダウンロード（Safari対応のBlob方式）
  const downloadFile = async (pdfBytes: Uint8Array, fileName: string): Promise<void> => {
    // TypeScript互換性のためArrayBufferを新規作成
    const arrayBuffer = new ArrayBuffer(pdfBytes.length)
    new Uint8Array(arrayBuffer).set(pdfBytes)
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' })

    // Safari判定
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

    if (isSafari) {
      // SafariではBlobを新しいタブで開く（ユーザーがCmd+Sで保存）
      const blobUrl = URL.createObjectURL(blob)
      const newWindow = window.open(blobUrl, '_blank')

      if (newWindow) {
        // タイトルを設定してファイル名のヒントを提供
        setTimeout(() => {
          try {
            newWindow.document.title = fileName
          } catch {
            // クロスオリジンエラーは無視
          }
        }, 100)

        toast.info('PDFが新しいタブで開きました。Cmd+Sで保存してください。', {
          duration: 5000,
        })
      } else {
        // ポップアップがブロックされた場合、直接リンクをクリック
        const a = document.createElement('a')
        a.href = blobUrl
        a.target = '_blank'
        a.click()
        toast.info('PDFが開きます。保存するにはCmd+Sを押してください。', {
          duration: 5000,
        })
      }

      // クリーンアップ
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
    } else {
      // Chrome/Firefox等ではdownload属性が使える
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
      }, 200)
    }
  }

  // PDF generation params (shared between export and publish)
  const getPdfParams = useCallback(() => ({
    pages,
    maskSettings,
    blocks,
    companyProfile,
    pageDimensions,
    pageScales,
  }), [pages, maskSettings, blocks, companyProfile, pageDimensions, pageScales])

  // PDF出力（全ページを1つのPDFに統合）
  const handleExport = async () => {
    setExporting(true)
    try {
      const pdfBytes = await generateModifiedPdf(getPdfParams())
      const fileName = `帯替え済み_${new Date().toISOString().slice(0, 10)}.pdf`

      await downloadFile(pdfBytes, fileName)
      toast.success(`${pages.length}ページのPDFをダウンロードしました`)

      // Notionにログを記録（fire-and-forget）
      const firstFileName = pages[0]?.fileName || '不明'
      fetch('/api/log-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: firstFileName,
          userEmail: userEmail || '',
          companyName: companyProfile?.company_name || '',
          pageCount: pages.length,
        }),
      }).catch((err) => {
        console.error('[log-export] Failed to log:', err)
      })
    } catch (error) {
      console.error('Export error:', error)
      toast.error('PDF出力に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">プレビュー・配置編集</h3>
          <p className="text-sm text-muted-foreground">
            会社情報ブロックをドラッグして配置を調整してください
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>
            戻る
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? '出力中...' : 'PDFを出力'}
          </Button>
          <Button variant="outline" onClick={() => setShowPublishDialog(true)} disabled={exporting}>
            Web公開
          </Button>
        </div>
      </div>

      <PublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        pdfParams={getPdfParams()}
        defaultTitle={pages[0]?.fileName?.replace(/\.pdf$/i, '') || '物件'}
        userEmail={userEmail}
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-9 overflow-y-auto max-h-[80vh]" ref={containerRef}>
          <div className="space-y-6">
            {pages.map((page, index) => {
              const mask = maskSettings[page.id]
              const dims = pageDimensions[page.id]
              const pageBlocks = blocks[page.id] || []
              const scale = pageScales[page.id] || 1.0
              const file = pageFiles[page.id]

              if (!mask) return null

              return (
                <div key={page.id}>
                  {/* ページラベル */}
                  <div className="text-sm text-muted-foreground mb-2">
                    {index + 1} / {pages.length} - {page.fileName}
                  </div>

                  {/* PDFプレビュー + BlockEditor */}
                  <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
                    {isReady && file && maxWidth > 0 ? (
                      <Document
                        file={file}
                        loading={<div className="p-8 text-gray-500">PDFを読み込み中...</div>}
                        error={<div className="p-8 text-red-500">PDFの読み込みに失敗しました</div>}
                      >
                        <Page
                          pageNumber={page.pageNumber}
                          scale={scale}
                          onLoadSuccess={createPageLoadHandler(page.id, mask)}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </Document>
                    ) : (
                      <div className="p-8 text-gray-500">PDFライブラリを準備中...</div>
                    )}

                    {dims && dims.width > 0 && (
                      <div
                        className="absolute top-0 left-0 pointer-events-none"
                        style={{ width: dims.width, height: dims.height }}
                      >
                        {mask.bottomHeight > 0 && (
                          <div
                            className="absolute left-0 right-0 bg-white"
                            style={{
                              bottom: 0,
                              height: mask.bottomHeight * scale,
                            }}
                          />
                        )}

                        {mask.enableLShape && mask.leftWidth > 0 && (
                          <div
                            className="absolute top-0 left-0 bg-white"
                            style={{
                              width: mask.leftWidth * scale,
                              height: dims.height - mask.bottomHeight * scale,
                            }}
                          />
                        )}
                      </div>
                    )}

                    {dims && dims.width > 0 && (
                      <BlockEditor
                        canvasWidth={dims.width}
                        canvasHeight={dims.height}
                        maskBottomHeight={mask.bottomHeight * scale}
                        maskLeftWidth={mask.leftWidth * scale}
                        enableLShape={mask.enableLShape}
                        companyProfile={companyProfile}
                        blocks={pageBlocks}
                        onBlocksChange={createBlocksChangeHandler(page.id)}
                        selectedBlockId={selectedBlockId}
                        onSelectBlock={setSelectedBlockId}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="col-span-3">
          <BlockProperties
            block={selectedBlock}
            onUpdate={handleBlockUpdate}
            onDelete={handleBlockDelete}
          />

          {companyProfile && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">登録済み会社情報</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <p><strong>会社名:</strong> {companyProfile.company_name}</p>
                <p><strong>住所:</strong> {companyProfile.address}</p>
                <p><strong>電話:</strong> {companyProfile.phone}</p>
                <p><strong>免許:</strong> {companyProfile.license_number}</p>
                {companyProfile.logo_url && <p><strong>ロゴ:</strong> 登録済み</p>}
                {companyProfile.line_qr_url && <p><strong>LINE QR:</strong> 登録済み</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
