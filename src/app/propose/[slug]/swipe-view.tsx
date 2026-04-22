'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { SwipeCard } from '@/components/propose/swipe-card'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

interface SwipeItem {
  listingId: string
  title: string
  imageUrl: string
}

interface SwipeViewProps {
  proposalId: string
  proposalSlug: string
  customerName: string
  items: SwipeItem[]
}

export function SwipeView({ proposalSlug, customerName, items }: SwipeViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // Track the furthest index the user has reached so we can display a
  // "件閲覧済み" counter without writing to Supabase.
  const [maxReached, setMaxReached] = useState(0)
  const viewStartTime = useRef<number>(0)

  useEffect(() => {
    viewStartTime.current = Date.now()
  }, [])

  const currentItem = items[currentIndex]

  // Fire analytics when currentItem changes (no setState here).
  useEffect(() => {
    if (!currentItem) return
    window.gtag?.('event', 'property_viewed', {
      proposal_id: proposalSlug,
      property_id: currentItem.listingId,
      property_title: currentItem.title,
      index: currentIndex + 1,
      total: items.length,
    })
  }, [currentItem, currentIndex, items.length, proposalSlug])

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      const item = items[currentIndex]
      if (!item) return

      const viewedSeconds = Math.round((Date.now() - viewStartTime.current) / 1000)
      window.gtag?.('event', 'property_navigate', {
        proposal_id: proposalSlug,
        property_id: item.listingId,
        direction,
        viewed_seconds: viewedSeconds,
      })

      setCurrentIndex((prev) => {
        const nextIdx =
          direction === 'next'
            ? Math.min(prev + 1, items.length - 1)
            : Math.max(prev - 1, 0)
        setMaxReached((m) => Math.max(m, nextIdx))
        return nextIdx
      })
      viewStartTime.current = Date.now()
    },
    [currentIndex, items, proposalSlug]
  )

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < items.length - 1
  const isLast = currentIndex === items.length - 1
  const viewedCount = Math.min(items.length, maxReached + 1)

  if (!currentItem) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 text-gray-500">
        物件が見つかりませんでした
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-4 py-4 text-center">
        <p className="text-sm text-gray-500">{customerName}様への物件提案</p>
        <p className="text-xs text-gray-400 mt-1">
          左右にスワイプ、またはボタンで物件を切り替えられます
        </p>
      </header>

      {/* Swipe area */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4">
        <SwipeCard
          key={currentItem.listingId}
          imageUrl={currentItem.imageUrl}
          title={currentItem.title}
          index={currentIndex}
          total={items.length}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onNavigate={handleNavigate}
        />
      </div>

      {isLast && (
        <div className="pb-8 text-center text-sm text-gray-500">
          🎉 全{items.length}件ご覧いただきました（{viewedCount}件閲覧済み）
        </div>
      )}
    </div>
  )
}
