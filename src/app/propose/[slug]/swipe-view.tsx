'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SwipeCard } from '@/components/propose/swipe-card'
import { createClient } from '@/lib/supabase/client'

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

export function SwipeView({ proposalId, proposalSlug, customerName, items }: SwipeViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [done, setDone] = useState(false)
  const viewStartTime = useRef(Date.now())
  const router = useRouter()
  const supabase = createClient()

  const handleSwipe = useCallback(async (direction: 'like' | 'pass') => {
    const item = items[currentIndex]
    if (!item) return

    const viewedSeconds = Math.round((Date.now() - viewStartTime.current) / 1000)

    // Save to Supabase
    await supabase.from('swipe_results').upsert({
      proposal_id: proposalId,
      listing_id: item.listingId,
      liked: direction === 'like',
      viewed_seconds: viewedSeconds,
    }, { onConflict: 'proposal_id,listing_id' })

    // GA4 custom event
    window.gtag?.('event', 'property_swipe', {
      proposal_id: proposalSlug,
      property_id: item.listingId,
      property_title: item.title,
      direction,
      viewed_seconds: viewedSeconds,
    })

    // Next card or done
    if (currentIndex + 1 >= items.length) {
      setDone(true)
    } else {
      setCurrentIndex(prev => prev + 1)
      viewStartTime.current = Date.now()
    }
  }, [currentIndex, items, proposalId, proposalSlug, supabase])

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">
            全{items.length}件の確認が完了しました
          </h1>
          <p className="text-gray-500">
            気になった物件を振り返りましょう
          </p>
          <button
            onClick={() => router.push(`/propose/${proposalSlug}/review`)}
            className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-700 transition-colors"
          >
            気になる物件を見る
          </button>
        </div>
      </div>
    )
  }

  const currentItem = items[currentIndex]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="px-4 py-4 text-center">
        <p className="text-sm text-gray-500">{customerName}様への物件提案</p>
        <p className="text-xs text-gray-400 mt-1">
          左にスワイプで「パス」、右にスワイプで「いいね」
        </p>
      </header>

      {/* Swipe area */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        {currentItem && (
          <SwipeCard
            key={currentItem.listingId}
            imageUrl={currentItem.imageUrl}
            title={currentItem.title}
            index={currentIndex}
            total={items.length}
            onSwipe={handleSwipe}
          />
        )}
      </div>
    </div>
  )
}
