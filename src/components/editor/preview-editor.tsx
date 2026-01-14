'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { BlockEditor, createInitialBlocks } from './block-editor'
import { BlockProperties } from './block-properties'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { CompanyProfile, Block, TextBlock } from '@/lib/database.types'
import type { MaskSettings } from './pdf-viewer'
import type { PageInfo } from './page-list'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [pageDimensions, setPageDimensions] = useState<{ [pageId: string]: { width: number; height: number } }>({})
  const [blocks, setBlocks] = useState<{ [pageId: string]: Block[] }>({})
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const scale = 1.5

  const currentPage = pages[currentPageIndex]
  const currentMask = currentPage ? maskSettings[currentPage.id] : null
  const currentBlocks = currentPage ? blocks[currentPage.id] || [] : []

  // PDF描画
  useEffect(() => {
    const renderPdf = async () => {
      if (!canvasRef.current || !currentPage) return

      try {
        const pdf = await pdfjsLib.getDocument({ data: currentPage.pdfData }).promise
        const page = await pdf.getPage(currentPage.pageNumber)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.width = viewport.width
        canvas.height = viewport.height
        setDimensions({ width: viewport.width, height: viewport.height })
        // ページごとの寸法を保存
        setPageDimensions((prev) => ({
          ...prev,
          [currentPage.id]: { width: viewport.width, height: viewport.height }
        }))

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise

        // 白塗り領域を描画
        if (currentMask) {
          context.fillStyle = 'white'
          // 下部
          context.fillRect(
            0,
            canvas.height - currentMask.bottomHeight,
            canvas.width,
            currentMask.bottomHeight
          )
          // L字の左側
          if (currentMask.enableLShape && currentMask.leftWidth > 0) {
            context.fillRect(0, 0, currentMask.leftWidth, canvas.height - currentMask.bottomHeight)
          }
        }

        // 初期ブロックがなければ生成
        if (!blocks[currentPage.id] && currentMask) {
          const initialBlocks = createInitialBlocks(
            viewport.width,
            viewport.height,
            currentMask.bottomHeight,
            currentMask.leftWidth,
            currentMask.enableLShape
          )
          setBlocks((prev) => ({ ...prev, [currentPage.id]: initialBlocks }))
        }
      } catch (error) {
        console.error('PDF render error:', error)
      }
    }

    renderPdf()
  }, [currentPage, currentMask, scale])

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

  // PDF出力
  const handleExport = async () => {
    setExporting(true)
    try {
      // 処理するページをグループ化（fileIdで同じPDFファイルをまとめる）
      const pdfGroups = new Map<string, { pages: PageInfo[]; pdfData: ArrayBuffer }>()

      for (const page of pages) {
        if (!pdfGroups.has(page.fileId)) {
          pdfGroups.set(page.fileId, { pages: [], pdfData: page.pdfData })
        }
        pdfGroups.get(page.fileId)!.pages.push(page)
      }

      const outputPdfs: { name: string; data: Uint8Array }[] = []

      for (const [key, group] of pdfGroups) {
        const pdfDoc = await PDFDocument.load(group.pdfData)
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        for (const page of group.pages) {
          const mask = maskSettings[page.id]
          const pageBlocks = blocks[page.id] || []
          if (!mask) continue

          const pdfPage = pdfDoc.getPage(page.pageNumber - 1)
          const { width, height } = pdfPage.getSize()

          // ページごとの寸法を使用してスケール補正
          const dims = pageDimensions[page.id] || { width: width / scale, height: height / scale }
          const canvasWidth = dims.width
          const canvasHeight = dims.height
          const scaleRatio = width / canvasWidth

          // 白塗り
          pdfPage.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: mask.bottomHeight * scaleRatio,
            color: rgb(1, 1, 1),
          })

          if (mask.enableLShape && mask.leftWidth > 0) {
            pdfPage.drawRectangle({
              x: 0,
              y: mask.bottomHeight * scaleRatio,
              width: mask.leftWidth * scaleRatio,
              height: height - mask.bottomHeight * scaleRatio,
              color: rgb(1, 1, 1),
            })
          }

          // テキストブロック描画
          for (const block of pageBlocks) {
            if (block.type !== 'text' || !companyProfile) continue

            const textBlock = block as TextBlock
            const content = companyProfile[textBlock.field as keyof CompanyProfile] as string
            if (!content) continue

            const font = textBlock.fontWeight === 'bold' ? helveticaBold : helveticaFont
            const fontSize = textBlock.fontSize * scaleRatio

            // テキスト幅を計算してtextAlignを適用
            const textWidth = font.widthOfTextAtSize(content, fontSize)
            const blockWidthPdf = textBlock.width * scaleRatio
            let x = textBlock.x * scaleRatio

            if (textBlock.textAlign === 'center') {
              x += (blockWidthPdf - textWidth) / 2
            } else if (textBlock.textAlign === 'right') {
              x += blockWidthPdf - textWidth
            }

            // PDF座標系は下からなので変換
            const y = (canvasHeight - textBlock.y - textBlock.height) * scaleRatio

            pdfPage.drawText(content, {
              x,
              y,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            })
          }
        }

        const pdfBytes = await pdfDoc.save()
        outputPdfs.push({
          name: group.pages[0].fileName.replace('.pdf', '_edited.pdf'),
          data: pdfBytes,
        })
      }

      // ダウンロード
      for (const pdf of outputPdfs) {
        const blob = new Blob([new Uint8Array(pdf.data)], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = pdf.name
        a.click()
        URL.revokeObjectURL(url)
      }

      toast.success(`${outputPdfs.length}件のPDFを出力しました`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('PDF出力に失敗しました')
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

      {/* ページ切り替え */}
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
        {/* PDFビューア + ブロックエディタ */}
        <div className="col-span-9">
          <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
            <canvas ref={canvasRef} className="block" />
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

        {/* ブロック設定パネル */}
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
