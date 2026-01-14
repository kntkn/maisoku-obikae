'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { BlockEditor, createInitialBlocks } from './block-editor'
import { BlockProperties } from './block-properties'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { CompanyProfile, Block, TextBlock } from '@/lib/database.types'
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
  onBack: () => void
}

export function PreviewEditor({
  pages,
  maskSettings,
  companyProfile,
  onBack,
}: PreviewEditorProps) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [pageDimensions, setPageDimensions] = useState<{ [pageId: string]: { width: number; height: number } }>({})
  const [blocks, setBlocks] = useState<{ [pageId: string]: Block[] }>({})
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [scale, setScale] = useState(1.0)
  const [originalPageSize, setOriginalPageSize] = useState({ width: 0, height: 0 })
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

  const currentPage = pages[currentPageIndex]
  const currentMask = currentPage ? maskSettings[currentPage.id] : null
  const currentBlocks = currentPage ? blocks[currentPage.id] || [] : []

  // fileオブジェクトをメモ化して無限レンダリングを防止
  const file = useMemo(
    () => currentPage ? { data: currentPage.pdfData.slice() } : null,
    [currentPage?.id, currentPage?.pdfData]
  )

  const onPageLoadSuccess = useCallback(
    (page: { width: number; height: number }) => {
      if (!currentPage || !currentMask) return

      // page.width/heightは既にscale適用済み
      const origWidth = page.width / scale
      const origHeight = page.height / scale

      // 最初のロードで元のサイズを保存
      if (originalPageSize.width === 0) {
        setOriginalPageSize({ width: origWidth, height: origHeight })

        // maxWidthに基づいて適切なスケールを計算
        if (maxWidth > 0 && origWidth > maxWidth) {
          const newScale = maxWidth / origWidth
          setScale(newScale)
          return // 新しいスケールで再レンダリングされる
        }
      }

      setDimensions({ width: page.width, height: page.height })
      setPageDimensions((prev) => ({
        ...prev,
        [currentPage.id]: { width: page.width, height: page.height }
      }))

      // 初期ブロックがなければ生成
      setBlocks((prev) => {
        if (prev[currentPage.id]) return prev
        const initialBlocks = createInitialBlocks(
          page.width,
          page.height,
          currentMask.bottomHeight,
          currentMask.leftWidth,
          currentMask.enableLShape
        )
        return { ...prev, [currentPage.id]: initialBlocks }
      })
    },
    [currentPage?.id, currentMask, scale, originalPageSize.width, maxWidth]
  )

  const handleBlocksChange = useCallback(
    (newBlocks: Block[]) => {
      if (!currentPage) return
      setBlocks((prev) => ({ ...prev, [currentPage.id]: newBlocks }))
    },
    [currentPage]
  )

  const handleBlockUpdate = useCallback(
    (updatedBlock: Block) => {
      if (!currentPage) return
      setBlocks((prev) => ({
        ...prev,
        [currentPage.id]: (prev[currentPage.id] || []).map((b) =>
          b.id === updatedBlock.id ? updatedBlock : b
        ),
      }))
    },
    [currentPage]
  )

  const handleBlockDelete = useCallback(
    (id: string) => {
      if (!currentPage) return
      setBlocks((prev) => ({
        ...prev,
        [currentPage.id]: (prev[currentPage.id] || []).filter((b) => b.id !== id),
      }))
      setSelectedBlockId(null)
    },
    [currentPage]
  )

  const selectedBlock = currentBlocks.find((b) => b.id === selectedBlockId) || null

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

  // PDF出力（全ページを1つのPDFに統合）
  const handleExport = async () => {
    setExporting(true)
    try {
      // 日本語フォントを取得
      const fontUrl = '/fonts/NotoSansJP-Regular.ttf'
      const fontBoldUrl = '/fonts/NotoSansJP-Bold.ttf'

      const [fontResponse, fontBoldResponse] = await Promise.all([
        fetch(fontUrl),
        fetch(fontBoldUrl)
      ])

      if (!fontResponse.ok || !fontBoldResponse.ok) {
        throw new Error('フォントの読み込みに失敗しました')
      }

      const fontBytes = await fontResponse.arrayBuffer()
      const fontBoldBytes = await fontBoldResponse.arrayBuffer()

      // 新しい統合PDFを作成
      const mergedPdf = await PDFDocument.create()
      mergedPdf.registerFontkit(fontkit)

      // フォントを埋め込み
      const japaneseFont = await mergedPdf.embedFont(fontBytes)
      const japaneseFontBold = await mergedPdf.embedFont(fontBoldBytes)

      // 各ページを処理
      for (const page of pages) {
        const mask = maskSettings[page.id]
        const pageBlocks = blocks[page.id] || []
        if (!mask) continue

        // 元のPDFからページをコピー
        const sourcePdf = await PDFDocument.load(page.pdfData)
        const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [page.pageNumber - 1])
        mergedPdf.addPage(copiedPage)

        // 追加したページを取得
        const pdfPage = mergedPdf.getPage(mergedPdf.getPageCount() - 1)
        const { width, height } = pdfPage.getSize()

        const dims = pageDimensions[page.id] || { width: width, height: height }
        const scaleRatio = width / dims.width

        // 白塗り（下部）
        pdfPage.drawRectangle({
          x: 0,
          y: 0,
          width: width,
          height: mask.bottomHeight * scaleRatio,
          color: rgb(1, 1, 1),
        })

        // 白塗り（L字の左側）
        if (mask.enableLShape && mask.leftWidth > 0) {
          pdfPage.drawRectangle({
            x: 0,
            y: mask.bottomHeight * scaleRatio,
            width: mask.leftWidth * scaleRatio,
            height: height - mask.bottomHeight * scaleRatio,
            color: rgb(1, 1, 1),
          })
        }

        // テキストブロックを描画
        for (const block of pageBlocks) {
          if (block.type !== 'text' || !companyProfile) continue

          const textBlock = block as TextBlock
          const content = companyProfile[textBlock.field as keyof CompanyProfile] as string
          if (!content) continue

          const font = textBlock.fontWeight === 'bold' ? japaneseFontBold : japaneseFont
          const fontSize = textBlock.fontSize * scaleRatio

          const textWidth = font.widthOfTextAtSize(content, fontSize)
          const blockWidthPdf = textBlock.width * scaleRatio
          let x = textBlock.x * scaleRatio

          if (textBlock.textAlign === 'center') {
            x += (blockWidthPdf - textWidth) / 2
          } else if (textBlock.textAlign === 'right') {
            x += blockWidthPdf - textWidth
          }

          const y = height - (textBlock.y + textBlock.height) * scaleRatio

          pdfPage.drawText(content, {
            x,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          })
        }
      }

      // PDFを保存してダウンロード
      const pdfBytes = await mergedPdf.save()
      const fileName = `帯替え済み_${new Date().toISOString().slice(0, 10)}.pdf`

      await downloadFile(new Uint8Array(pdfBytes), fileName)
      toast.success(`${pages.length}ページのPDFをダウンロードしました`)
    } catch (error) {
      console.error('Export error:', error)
      console.error('Error details:', error instanceof Error ? error.message : String(error))
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
        </div>
      </div>

      {pages.length > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
            disabled={currentPageIndex === 0}
          >
            前へ
          </Button>
          <span className="text-sm">
            {currentPageIndex + 1} / {pages.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPageIndex((i) => Math.min(pages.length - 1, i + 1))}
            disabled={currentPageIndex === pages.length - 1}
          >
            次へ
          </Button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-9" ref={containerRef}>
          <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
            {currentPage && isReady && file && maxWidth > 0 ? (
              <Document
                file={file}
                loading={<div className="p-8 text-gray-500">PDFを読み込み中...</div>}
                error={<div className="p-8 text-red-500">PDFの読み込みに失敗しました</div>}
              >
                <Page
                  pageNumber={currentPage.pageNumber}
                  scale={scale}
                  onLoadSuccess={onPageLoadSuccess}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            ) : (
              <div className="p-8 text-gray-500">PDFライブラリを準備中...</div>
            )}

            {dimensions.width > 0 && currentMask && (
              <div
                className="absolute top-0 left-0 pointer-events-none"
                style={{ width: dimensions.width, height: dimensions.height }}
              >
                {currentMask.bottomHeight > 0 && (
                  <div
                    className="absolute left-0 right-0 bg-white"
                    style={{
                      bottom: 0,
                      height: currentMask.bottomHeight,
                    }}
                  />
                )}

                {currentMask.enableLShape && currentMask.leftWidth > 0 && (
                  <div
                    className="absolute top-0 left-0 bg-white"
                    style={{
                      width: currentMask.leftWidth,
                      height: dimensions.height - currentMask.bottomHeight,
                    }}
                  />
                )}
              </div>
            )}

            {dimensions.width > 0 && currentMask && (
              <BlockEditor
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
                maskBottomHeight={currentMask.bottomHeight}
                maskLeftWidth={currentMask.leftWidth}
                enableLShape={currentMask.enableLShape}
                companyProfile={companyProfile}
                blocks={currentBlocks}
                onBlocksChange={handleBlocksChange}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
              />
            )}
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
