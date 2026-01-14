'use client'

import { useState, useCallback, useEffect } from 'react'
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isReady, setIsReady] = useState(false)

  // worker設定をuseEffect内で実行
  useEffect(() => {
    import('react-pdf').then((mod) => {
      const version = mod.pdfjs.version
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
      setIsReady(true)
    })
  }, [])

  const onPageLoadSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setDimensions({ width: page.width * scale, height: page.height * scale })
    },
    [scale]
  )

  if (!isReady) {
    return (
      <div className="p-8 text-gray-500">PDFライブラリを準備中...</div>
    )
  }

  return (
    <div className="relative inline-block border rounded-lg overflow-hidden shadow-lg">
      <Document
        file={pdfData}
        loading={<div className="p-8 text-gray-500">PDFを読み込み中...</div>}
        error={<div className="p-8 text-red-500">PDFの読み込みに失敗しました</div>}
      >
        <Page
          pageNumber={pageNumber}
          scale={scale}
          onLoadSuccess={onPageLoadSuccess}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {/* オーバーレイ（赤い半透明マスク） */}
      {dimensions.width > 0 && (
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          {/* 下部のマスク */}
          {maskSettings.bottomHeight > 0 && (
            <div
              className="absolute left-0 right-0 bg-red-500/40"
              style={{
                bottom: 0,
                height: maskSettings.bottomHeight,
              }}
            />
          )}

          {/* L字の左側マスク */}
          {maskSettings.enableLShape && maskSettings.leftWidth > 0 && (
            <div
              className="absolute top-0 left-0 bg-red-500/40"
              style={{
                width: maskSettings.leftWidth,
                height: dimensions.height - maskSettings.bottomHeight,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
