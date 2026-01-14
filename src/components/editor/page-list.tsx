'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import type { PageInfo } from '@/types/editor'

// 型をre-export（他のファイルとの互換性のため）
export type { PageInfo } from '@/types/editor'

// react-pdfをクライアントサイドのみでロード
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
)

const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
)

interface PageListProps {
  pages: PageInfo[]
  selectedPageId: string | null
  onSelectPage: (id: string) => void
}

export function PageList({ pages, selectedPageId, onSelectPage }: PageListProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-sm text-gray-700 px-2">
        物件一覧 ({pages.length}件)
      </h3>
      <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
        {pages.map((page) => (
          <PageThumbnail
            key={page.id}
            page={page}
            isSelected={page.id === selectedPageId}
            onClick={() => onSelectPage(page.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface PageThumbnailProps {
  page: PageInfo
  isSelected: boolean
  onClick: () => void
}

function PageThumbnail({ page, isSelected, onClick }: PageThumbnailProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    import('react-pdf').then((mod) => {
      const version = mod.pdfjs.version
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
      setIsReady(true)
    })
  }, [])

  const statusColors = {
    pending: 'bg-gray-100',
    editing: 'bg-yellow-100',
    done: 'bg-green-100',
  }

  const statusLabels = {
    pending: '未編集',
    editing: '編集中',
    done: '完了',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-2 rounded-lg border-2 transition-all text-left',
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'
      )}
    >
      <div className="flex gap-2">
        <div className="w-16 h-20 flex-shrink-0 border rounded bg-white overflow-hidden flex items-center justify-center">
          {isReady ? (
            <Document file={page.pdfData} loading={null} error={null}>
              <Page
                pageNumber={page.pageNumber}
                width={60}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          ) : (
            <div className="text-xs text-gray-400">...</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{page.fileName}</p>
          <p className="text-xs text-gray-500">ページ {page.pageNumber}</p>
          <span
            className={cn(
              'inline-block mt-1 px-1.5 py-0.5 text-xs rounded',
              statusColors[page.status]
            )}
          >
            {statusLabels[page.status]}
          </span>
        </div>
      </div>
    </button>
  )
}
