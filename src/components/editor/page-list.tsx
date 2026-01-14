'use client'

import { useEffect, useRef } from 'react'
import { loadPdf, renderPdfPage } from '@/lib/pdf'
import { cn } from '@/lib/utils'

export interface PageInfo {
  id: string
  fileId: string
  fileIndex: number
  pageNumber: number
  fileName: string
  pdfData: ArrayBuffer
  status: 'pending' | 'editing' | 'done'
  canvasDimensions?: { width: number; height: number }
}

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
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const renderThumbnail = async () => {
      if (!canvasRef.current) return

      try {
        const pdf = await loadPdf(page.pdfData)
        await renderPdfPage(pdf, page.pageNumber, canvasRef.current, 0.2)
      } catch (error) {
        console.error('Thumbnail render error:', error)
      }
    }

    renderThumbnail()
  }, [page.pdfData, page.pageNumber])

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
        <canvas
          ref={canvasRef}
          className="border rounded bg-white"
          style={{ width: 60, height: 'auto' }}
        />
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
