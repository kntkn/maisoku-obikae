'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
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

        // pdf-libでは回転属性があるページに描画する際、
        // 描画座標は回転前の座標系で指定するが、
        // 表示時にページ全体が回転される
        // よって、表示上の「下部」に白塗りするには、
        // 回転前の座標系で「回転後に下部になる位置」を指定する必要がある

        // 回転を考慮した実際の表示サイズを計算
        const isRotated = rotation === 90 || rotation === 270
        const displayWidth = isRotated ? rawHeight : rawWidth  // 表示上の幅
        const displayHeight = isRotated ? rawWidth : rawHeight  // 表示上の高さ

        const dims = pageDimensions[page.id] || { width: displayWidth, height: displayHeight }
        // scaleRatioは表示座標からPDF座標への変換比率
        const scaleRatio = displayWidth / dims.width

        console.log(`[PDF Export] Page ${i + 1} scaleRatio:`, {
          displayWidth,
          dims: dims.width,
          scaleRatio,
        })

        // 回転がある場合は、ページの回転を解除してコンテンツを正規化する
        // これにより、座標計算がシンプルになる
        if (rotation !== 0) {
          // 回転を0に設定（ページ属性のみ変更、コンテンツは変わらない）
          // pdf-libでは、これだけだとコンテンツが回転して表示される問題がある
          // 代わりに、回転を維持したまま、正しい座標で描画する
        }

        // 白塗り（下部）
        // PDFの座標系は左下原点、y軸上向き
        // 回転0度: y=0が下端なので、y=0から描画
        // 回転90度（反時計回り）: 元の左端(x=0)が表示上の下端になる
        // 回転180度: 元の上端(y=rawHeight)が表示上の下端になる
        // 回転270度: 元の右端(x=rawWidth)が表示上の下端になる

        const bottomMaskHeight = mask.bottomHeight // PDF座標での高さ（スケール前）

        let maskX: number, maskY: number, maskW: number, maskH: number

        switch (rotation) {
          case 90:
            // 90度反時計回り回転: 元の左側が表示上の下部になる
            // 元のページで x=0 から width=bottomMaskHeight の範囲が表示上の下部
            maskX = 0
            maskY = 0
            maskW = bottomMaskHeight
            maskH = rawHeight  // 表示上の幅 = 元の高さ
            break
          case 180:
            // 180度回転: 元の上部が表示上の下部になる
            maskX = 0
            maskY = rawHeight - bottomMaskHeight
            maskW = rawWidth
            maskH = bottomMaskHeight
            break
          case 270:
            // 270度反時計回り（=90度時計回り）: 元の右側が表示上の下部になる
            maskX = rawWidth - bottomMaskHeight
            maskY = 0
            maskW = bottomMaskHeight
            maskH = rawHeight
            break
          default:
            // 回転なし
            maskX = 0
            maskY = 0
            maskW = rawWidth
            maskH = bottomMaskHeight
        }

        console.log(`[PDF Export] Page ${i + 1} bottomMask:`, {
          rotation,
          mask: { x: maskX, y: maskY, w: maskW, h: maskH },
        })

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
              // 元の下部が表示上の左側になる
              leftX = 0
              leftY = 0
              leftW = rawWidth - bottomMaskHeight  // 元の幅 - 下部マスク分
              leftH = leftMaskWidth
              break
            case 180:
              // 元の右部が表示上の左側になる
              leftX = rawWidth - leftMaskWidth
              leftY = 0
              leftW = leftMaskWidth
              leftH = rawHeight - bottomMaskHeight
              break
            case 270:
              // 元の上部が表示上の左側になる
              leftX = bottomMaskHeight  // 下部マスクの後ろから
              leftY = rawHeight - leftMaskWidth
              leftW = rawWidth - bottomMaskHeight
              leftH = leftMaskWidth
              break
            default:
              // 回転なし
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

        // テキストブロックを描画
        for (const block of pageBlocks) {
          if (block.type !== 'text' || !companyProfile) continue

          const textBlock = block as TextBlock
          const content = companyProfile[textBlock.field as keyof CompanyProfile] as string
          if (!content) continue

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
          const blockY = textBlock.y * scaleRatio  // ブロックの上端
          const baselineY = (textBlock.y + textBlock.height - 2) * scaleRatio  // ベースライン（少し上げる）

          // 回転に応じてPDF座標に変換
          let pdfTextX: number, pdfTextY: number
          let textRotation = 0

          switch (rotation) {
            case 90:
              // 90度反時計回り: 元の左端が表示の下端
              // 表示(dx, dy) → PDF(rawWidth - dy, dx) を逆算
              pdfTextX = baselineY
              pdfTextY = rawHeight - blockX - textWidthPx
              textRotation = -90
              break
            case 180:
              // 180度回転
              pdfTextX = displayWidth - blockX - textWidthPx
              pdfTextY = baselineY
              textRotation = 180
              break
            case 270:
              // 270度反時計回り: 元の右端が表示の下端
              // 表示座標(blockX, baselineY)を、回転前のPDF座標に変換
              // 表示の下部 = 元のPDFの右側
              // 表示の左側 = 元のPDFの下側
              pdfTextX = rawWidth - baselineY
              pdfTextY = blockX
              textRotation = -90
              break
            default:
              // 回転なし
              pdfTextX = blockX
              pdfTextY = displayHeight - baselineY
              textRotation = 0
          }

          console.log(`[PDF Export] Page ${i + 1} text "${content}":`, {
            rotation,
            block: { x: blockX, y: blockY, baselineY },
            pdf: { x: pdfTextX, y: pdfTextY },
            dims: { w: dims.width, h: dims.height || displayHeight },
            raw: { w: rawWidth, h: rawHeight },
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

      // Notionにログを記録（fire-and-forget: 失敗してもPDF出力には影響しない）
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
