'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { DocumentProps, PageProps } from 'react-pdf'

// react-pdfをクライアントサイドのみでロード
const Document = dynamic<DocumentProps>(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
)

const Page = dynamic<PageProps>(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
)

// worker設定をクライアントサイドで実行
if (typeof window !== 'undefined') {
  import('react-pdf').then((mod) => {
    mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`
  })
}

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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const onPageLoadSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setDimensions({ width: page.width * scale, height: page.height * scale })
    },
    [scale]
  )

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
