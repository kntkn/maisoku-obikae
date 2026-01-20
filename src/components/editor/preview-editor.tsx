'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { PDFDocument, rgb, degrees, PDFImage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { BlockEditor, createInitialBlocks } from './block-editor'
import { BlockProperties } from './block-properties'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { CompanyProfile, Block, TextBlock, ImageBlock } from '@/lib/database.types'
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

// 手数料フィールドのラベル
const FEE_LABELS: Record<string, string> = {
  fee_ratio_landlord: '貸主負担',
  fee_ratio_tenant: '借主負担',
  fee_distribution_motoduke: '元付配分',
  fee_distribution_kyakuzuke: '客付配分',
}

export function PreviewEditor({
  pages,
  maskSettings,
  companyProfile,
  userEmail,
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

      // 初期ブロックがなければ生成（スケールを適用した値で計算）
      setBlocks((prev) => {
        if (prev[currentPage.id]) return prev
        const initialBlocks = createInitialBlocks(
          page.width,
          page.height,
          currentMask.bottomHeight * scale,
          currentMask.leftWidth * scale,
          currentMask.enableLShape,
          companyProfile
        )
        return { ...prev, [currentPage.id]: initialBlocks }
      })
    },
    [currentPage?.id, currentMask, scale, originalPageSize.width, maxWidth, companyProfile]
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

  // 画像を埋め込む関数
  const embedImage = async (pdfDoc: PDFDocument, imageUrl: string): Promise<PDFImage | null> => {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        console.error('Failed to fetch image:', imageUrl)
        return null
      }
      const imageData = await response.arrayBuffer()
      const lowerUrl = imageUrl.toLowerCase()

      // 画像形式を判定して埋め込み
      if (lowerUrl.includes('.png') || lowerUrl.includes('png')) {
        return await pdfDoc.embedPng(imageData)
      } else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('jpeg')) {
        return await pdfDoc.embedJpg(imageData)
      } else {
        // フォールバック: JPEGとして試す、失敗したらPNG
        try {
          return await pdfDoc.embedJpg(imageData)
        } catch {
          try {
            return await pdfDoc.embedPng(imageData)
          } catch {
            console.error('Failed to embed image as JPG or PNG')
            return null
          }
        }
      }
    } catch (error) {
      console.error('Error embedding image:', error)
      return null
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

      // 画像キャッシュ（同じ画像を複数ページで使い回す）
      const imageCache: { [url: string]: PDFImage } = {}

      // 画像を事前に埋め込み（キャッシュ）
      if (companyProfile?.logo_url) {
        const logoImage = await embedImage(mergedPdf, companyProfile.logo_url)
        if (logoImage) {
          imageCache[companyProfile.logo_url] = logoImage
        }
      }
      if (companyProfile?.line_qr_url) {
        const qrImage = await embedImage(mergedPdf, companyProfile.line_qr_url)
        if (qrImage) {
          imageCache[companyProfile.line_qr_url] = qrImage
        }
      }

      // 各ページを処理
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const mask = maskSettings[page.id]
        const pageBlocks = blocks[page.id] || []
        if (!mask) continue

        // 元のPDFからページをコピー
        const sourcePdf = await PDFDocument.load(page.pdfData)
        const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [page.pageNumber - 1])
        mergedPdf.addPage(copiedPage)

        // 追加したページを取得
        const pdfPage = mergedPdf.getPage(mergedPdf.getPageCount() - 1)
        const { width: rawWidth, height: rawHeight } = pdfPage.getSize()
        const rotation = pdfPage.getRotation().angle

        // デバッグログ
        console.log(`[PDF Export] Page ${i + 1}:`, {
          rawWidth,
          rawHeight,
          rotation,
          mask,
          pageBlocks: pageBlocks.length,
        })

        // 回転を考慮した実際の表示サイズを計算
        const isRotated = rotation === 90 || rotation === 270
        const displayWidth = isRotated ? rawHeight : rawWidth
        const displayHeight = isRotated ? rawWidth : rawHeight

        const dims = pageDimensions[page.id] || { width: displayWidth, height: displayHeight }
        const scaleRatio = displayWidth / dims.width

        console.log(`[PDF Export] Page ${i + 1} scaleRatio:`, {
          displayWidth,
          dims: dims.width,
          scaleRatio,
        })

        // 白塗り（下部）
        const bottomMaskHeight = mask.bottomHeight

        let maskX: number, maskY: number, maskW: number, maskH: number

        switch (rotation) {
          case 90:
            maskX = 0
            maskY = 0
            maskW = bottomMaskHeight
            maskH = rawHeight
            break
          case 180:
            maskX = 0
            maskY = rawHeight - bottomMaskHeight
            maskW = rawWidth
            maskH = bottomMaskHeight
            break
          case 270:
            maskX = rawWidth - bottomMaskHeight
            maskY = 0
            maskW = bottomMaskHeight
            maskH = rawHeight
            break
          default:
            maskX = 0
            maskY = 0
            maskW = rawWidth
            maskH = bottomMaskHeight
        }

        pdfPage.drawRectangle({
          x: maskX,
          y: maskY,
          width: maskW,
          height: maskH,
          color: rgb(1, 1, 1),
        })

        // 白塗り（L字の左側）
        if (mask.enableLShape && mask.leftWidth > 0) {
          let leftX: number, leftY: number, leftW: number, leftH: number
          const leftMaskWidth = mask.leftWidth

          switch (rotation) {
            case 90:
              leftX = 0
              leftY = 0
              leftW = rawWidth - bottomMaskHeight
              leftH = leftMaskWidth
              break
            case 180:
              leftX = rawWidth - leftMaskWidth
              leftY = 0
              leftW = leftMaskWidth
              leftH = rawHeight - bottomMaskHeight
              break
            case 270:
              leftX = bottomMaskHeight
              leftY = rawHeight - leftMaskWidth
              leftW = rawWidth - bottomMaskHeight
              leftH = leftMaskWidth
              break
            default:
              leftX = 0
              leftY = bottomMaskHeight
              leftW = leftMaskWidth
              leftH = rawHeight - bottomMaskHeight
          }

          pdfPage.drawRectangle({
            x: leftX,
            y: leftY,
            width: leftW,
            height: leftH,
            color: rgb(1, 1, 1),
          })
        }

        // 画像ブロックを描画
        for (const block of pageBlocks) {
          if (block.type !== 'image' || !companyProfile) continue

          const imageBlock = block as ImageBlock
          const imageUrl = imageBlock.field === 'logo'
            ? companyProfile.logo_url
            : companyProfile.line_qr_url

          if (!imageUrl) continue
          const embeddedImage = imageCache[imageUrl]
          if (!embeddedImage) continue

          const drawWidth = imageBlock.width * scaleRatio
          const drawHeight = imageBlock.height * scaleRatio
          const blockX = imageBlock.x * scaleRatio
          const blockY = imageBlock.y * scaleRatio

          // 回転に応じてPDF座標に変換
          let pdfX: number, pdfY: number
          let imageRotation = 0

          switch (rotation) {
            case 90:
              pdfX = blockY
              pdfY = rawHeight - blockX - drawWidth
              imageRotation = -90
              break
            case 180:
              pdfX = displayWidth - blockX - drawWidth
              pdfY = blockY
              imageRotation = 180
              break
            case 270:
              pdfX = rawWidth - blockY - drawHeight
              pdfY = blockX
              imageRotation = 90
              break
            default:
              pdfX = blockX
              pdfY = displayHeight - blockY - drawHeight
              imageRotation = 0
          }

          console.log(`[PDF Export] Page ${i + 1} image "${imageBlock.field}":`, {
            rotation,
            block: { x: blockX, y: blockY, w: drawWidth, h: drawHeight },
            pdf: { x: pdfX, y: pdfY },
            imageRotation,
          })

          if (imageRotation !== 0) {
            // 回転が必要な場合
            pdfPage.drawImage(embeddedImage, {
              x: pdfX,
              y: pdfY,
              width: imageRotation === 90 || imageRotation === -90 ? drawHeight : drawWidth,
              height: imageRotation === 90 || imageRotation === -90 ? drawWidth : drawHeight,
              rotate: degrees(imageRotation),
            })
          } else {
            pdfPage.drawImage(embeddedImage, {
              x: pdfX,
              y: pdfY,
              width: drawWidth,
              height: drawHeight,
            })
          }
        }

        // テキストブロックを描画
        for (const block of pageBlocks) {
          if (block.type !== 'text' || !companyProfile) continue

          const textBlock = block as TextBlock

          // テキスト内容を取得（手数料フィールドは特別処理）
          let content: string
          if (textBlock.field.startsWith('fee_')) {
            const value = companyProfile[textBlock.field as keyof CompanyProfile] as number | null
            if (value === null || value === undefined) continue
            content = `${FEE_LABELS[textBlock.field] || textBlock.field}: ${value}%`
          } else {
            content = companyProfile[textBlock.field as keyof CompanyProfile] as string
            if (!content) continue
          }

          const font = textBlock.fontWeight === 'bold' ? japaneseFontBold : japaneseFont
          const fontSize = textBlock.fontSize * scaleRatio

          const textWidthPx = font.widthOfTextAtSize(content, fontSize)
          const blockWidthPdf = textBlock.width * scaleRatio

          // 表示座標系でのテキスト位置（左上原点、dims座標系）
          let blockX = textBlock.x * scaleRatio
          if (textBlock.textAlign === 'center') {
            blockX += (blockWidthPdf - textWidthPx) / 2
          } else if (textBlock.textAlign === 'right') {
            blockX += blockWidthPdf - textWidthPx
          }
          const blockY = textBlock.y * scaleRatio
          const baselineY = (textBlock.y + textBlock.height - 2) * scaleRatio

          // 回転に応じてPDF座標に変換
          let pdfTextX: number, pdfTextY: number
          let textRotation = 0

          switch (rotation) {
            case 90:
              pdfTextX = baselineY
              pdfTextY = rawHeight - blockX - textWidthPx
              textRotation = -90
              break
            case 180:
              pdfTextX = displayWidth - blockX - textWidthPx
              pdfTextY = baselineY
              textRotation = 180
              break
            case 270:
              pdfTextX = rawWidth - baselineY
              pdfTextY = blockX
              textRotation = -90
              break
            default:
              pdfTextX = blockX
              pdfTextY = displayHeight - baselineY
              textRotation = 0
          }

          console.log(`[PDF Export] Page ${i + 1} text "${content}":`, {
            rotation,
            block: { x: blockX, y: blockY, baselineY },
            pdf: { x: pdfTextX, y: pdfTextY },
            textRotation,
          })

          pdfPage.drawText(content, {
            x: pdfTextX,
            y: pdfTextY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
            rotate: textRotation !== 0 ? degrees(textRotation) : undefined,
          })
        }
      }

      // PDFを保存してダウンロード
      const pdfBytes = await mergedPdf.save()
      const fileName = `帯替え済み_${new Date().toISOString().slice(0, 10)}.pdf`

      await downloadFile(new Uint8Array(pdfBytes), fileName)
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
                      height: currentMask.bottomHeight * scale,
                    }}
                  />
                )}

                {currentMask.enableLShape && currentMask.leftWidth > 0 && (
                  <div
                    className="absolute top-0 left-0 bg-white"
                    style={{
                      width: currentMask.leftWidth * scale,
                      height: dimensions.height - currentMask.bottomHeight * scale,
                    }}
                  />
                )}
              </div>
            )}

            {dimensions.width > 0 && currentMask && (
              <BlockEditor
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
                maskBottomHeight={currentMask.bottomHeight * scale}
                maskLeftWidth={currentMask.leftWidth * scale}
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
