'use client'

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// PDF.js worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export interface MaskSettings {
  bottomHeight: number
  leftWidth: number
  enableLShape: boolean
}

interface PdfViewerProps {
  pdfData: ArrayBuffer
  pageNumber: number
  maskSettings: MaskSettings
  scale?: number
}

export function PdfViewer({
  pdfData,
  pageNumber,
  maskSettings,
  scale = 1.5,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const renderPdf = async () => {
      if (!canvasRef.current || !overlayCanvasRef.current) return

      try {
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.width = viewport.width
        canvas.height = viewport.height

        setDimensions({ width: viewport.width, height: viewport.height })

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        }).promise

        // オーバーレイキャンバスの設定
        const overlayCanvas = overlayCanvasRef.current
        overlayCanvas.width = viewport.width
        overlayCanvas.height = viewport.height
      } catch (error) {
        console.error('PDF render error:', error)
      }
    }

    renderPdf()
  }, [pdfData, pageNumber, scale])

  // マスク領域の描画
  useEffect(() => {
    if (!overlayCanvasRef.current || dimensions.width === 0) return

    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 赤オーバーレイ（半透明）
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'

    // 下部のマスク
    if (maskSettings.bottomHeight > 0) {
      ctx.fillRect(
        0,
        canvas.height - maskSettings.bottomHeight,
        canvas.width,
        maskSettings.bottomHeight
      )
    }

    // L字の場合、左側のマスク
    if (maskSettings.enableLShape && maskSettings.leftWidth > 0) {
      ctx.fillRect(
        0,
        0,
        maskSettings.leftWidth,
        canvas.height - maskSettings.bottomHeight
      )
    }
  }, [maskSettings, dimensions])

  return (
    <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
      <canvas ref={canvasRef} className="block" />
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 pointer-events-none"
      />
    </div>
  )
}
