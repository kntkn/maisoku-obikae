'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { MaskSettings } from '@/types/editor'

// 型をre-export（他のファイルとの互換性のため）
export type { MaskSettings } from '@/types/editor'

// react-pdfをクライアントサイドのみでロード
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false, loading: () => <div className="p-8 text-gray-500">読み込み中...</div> }
)

const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
)

interface PdfViewerProps {
  pdfData: Uint8Array
  pageNumber: number
  maskSettings: MaskSettings
  scale?: number
  maxWidth?: number
  maxHeight?: number
}

export function PdfViewer({
  pdfData,
  pageNumber,
  maskSettings,
  scale,
  maxWidth,
  maxHeight,
}: PdfViewerProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [calculatedScale, setCalculatedScale] = useState(scale || 1.0)
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 })
  const [isReady, setIsReady] = useState(false)

  // worker設定をuseEffect内で実行
  useEffect(() => {
    import('react-pdf').then((mod) => {
      const version = mod.pdfjs.version
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
      setIsReady(true)
    })
  }, [])

  // fileオブジェクトをメモ化して無限レンダリングを防止
  const file = useMemo(() => ({ data: pdfData.slice() }), [pdfData])

  const onPageLoadSuccess = useCallback(
    (page: { width: number; height: number; originalWidth?: number; originalHeight?: number }) => {
      // page.width/heightは既にscale適用済み
      const currentScale = scale || calculatedScale
      const origWidth = page.originalWidth || page.width / currentScale
      const origHeight = page.originalHeight || page.height / currentScale

      setOriginalSize({ width: origWidth, height: origHeight })

      // maxWidthまたはmaxHeightに基づいてスケールを計算
      let targetScale = currentScale

      if (maxWidth && origWidth > 0) {
        const widthScale = maxWidth / origWidth
        targetScale = Math.min(targetScale, widthScale)
      }

      if (maxHeight && origHeight > 0) {
        const heightScale = maxHeight / origHeight
        targetScale = Math.min(targetScale, heightScale)
      }

      if (targetScale !== currentScale) {
        setCalculatedScale(targetScale)
      }

      setDimensions({
        width: origWidth * targetScale,
        height: origHeight * targetScale
      })
    },
    [scale, maxWidth, maxHeight, calculatedScale]
  )

  if (!isReady) {
    return (
      <div className="p-8 text-gray-500">PDFライブラリを準備中...</div>
    )
  }

  return (
    <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
      <Document
        file={file}
        loading={<div className="p-8 text-gray-500">PDFを読み込み中...</div>}
        error={<div className="p-8 text-red-500">PDFの読み込みに失敗しました</div>}
      >
        <Page
          pageNumber={pageNumber}
          scale={calculatedScale}
          onLoadSuccess={onPageLoadSuccess}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {/* オーバーレイ（赤い半透明マスク） */}
      {originalSize.width > 0 && (
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: originalSize.width * calculatedScale,
            height: originalSize.height * calculatedScale
          }}
        >
          {/* 下部のマスク */}
          {maskSettings.bottomHeight > 0 && (
            <div
              className="absolute left-0 right-0 bg-red-500/40"
              style={{
                bottom: 0,
                height: maskSettings.bottomHeight * calculatedScale,
              }}
            />
          )}

          {/* L字の左側マスク */}
          {maskSettings.enableLShape && maskSettings.leftWidth > 0 && (
            <div
              className="absolute top-0 left-0 bg-red-500/40"
              style={{
                width: maskSettings.leftWidth * calculatedScale,
                height: (originalSize.height - maskSettings.bottomHeight) * calculatedScale,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
