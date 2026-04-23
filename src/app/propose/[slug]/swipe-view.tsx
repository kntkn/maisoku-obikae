'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { WelcomeHero } from '@/components/propose/welcome-hero'
import { SwipeCardV2, type Reaction, type SwipeCardListing } from '@/components/propose/swipe-card-v2'
import { PredictedRanking, type RankingListing } from '@/components/propose/predicted-ranking'
import {
  sendSwipeEvent,
  makeSessionId,
  hashId,
  submitConfirmation,
  type PerListingResult,
} from '@/lib/propose-analytics'
import { predictedScore } from '@/lib/propose-tags'

export interface ProposeListing {
  id: string
  title: string
  highlightTags: string[]
  pages: { image_url: string; width: number | null; height: number | null }[]
}

interface SwipeViewProps {
  proposalId: string
  proposalSlug: string
  customerName: string
  listings: ProposeListing[]
  initialRanking: string[]
  initialComment: string
  completedAt: string | null
}

type Screen = 'welcome' | 'swipe' | 'done'

interface PerProperty {
  dwellMs: number
  zoomCount: number
  pageTurnCount: number
  revisitCount: number
  selectedTags: string[]
  reaction: Reaction | null
  visited: boolean
}

function makePerPropertyInitial(listings: ProposeListing[]): Record<string, PerProperty> {
  const out: Record<string, PerProperty> = {}
  for (const l of listings) {
    out[l.id] = {
      dwellMs: 0,
      zoomCount: 0,
      pageTurnCount: 0,
      revisitCount: 0,
      selectedTags: [],
      reaction: null,
      visited: false,
    }
  }
  return out
}

export function SwipeView({
  proposalId,
  proposalSlug,
  customerName,
  listings,
  initialRanking,
  initialComment,
  completedAt,
}: SwipeViewProps) {
  // If the proposal was already completed, drop the customer straight into
  // the (read-only) ranking confirmation view.
  const [screen, setScreen] = useState<Screen>(completedAt ? 'done' : 'welcome')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [perProperty, setPerProperty] = useState<Record<string, PerProperty>>(() =>
    makePerPropertyInitial(listings),
  )
  const [finalRanking, setFinalRanking] = useState<string[]>(initialRanking)
  const [comment, setComment] = useState<string>(initialComment)

  const sessionIdRef = useRef<string>(makeSessionId())
  const sessionIdStable = sessionIdRef.current
  const customerHash = useMemo(() => hashId(proposalSlug), [proposalSlug])
  const viewStartTsRef = useRef<number>(0)

  // Shared analytics payload shape
  const sendOpts = useMemo(
    () => ({ proposalId, sessionId: sessionIdStable }),
    [proposalId, sessionIdStable],
  )

  const currentListing = listings[currentIndex]

  const send = (name: string, params: Record<string, unknown>) =>
    sendSwipeEvent(name, { customer_hash: customerHash, ...params }, sendOpts)

  // -------- lifecycle ---------
  // Fire property_view_start when the user enters/re-enters a card
  useEffect(() => {
    if (screen !== 'swipe' || !currentListing) return

    viewStartTsRef.current = performance.now()
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const isRevisit = cur?.visited
      const next = { ...prev }
      next[currentListing.id] = {
        ...cur,
        visited: true,
        revisitCount: isRevisit ? cur.revisitCount + 1 : cur.revisitCount,
      }
      if (isRevisit) {
        send('property_revisit', {
          property_id: currentListing.id,
          visit_count: cur.revisitCount + 2,
        })
      }
      return next
    })
    send('property_view_start', {
      property_id: currentListing.id,
      property_title: currentListing.title,
      index: currentIndex + 1,
      total: listings.length,
      pages: currentListing.pages.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentListing?.id, screen])

  function recordViewEnd() {
    if (!currentListing) return
    const dwellDelta = Math.round(performance.now() - viewStartTsRef.current)
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const next = { ...prev }
      next[currentListing.id] = { ...cur, dwellMs: cur.dwellMs + dwellDelta }
      return next
    })
    // Use the post-increment value for the event payload
    const cur = perProperty[currentListing.id]
    const totalDwell = (cur?.dwellMs ?? 0) + dwellDelta
    send('property_view_end', {
      property_id: currentListing.id,
      dwell_ms: dwellDelta,
      total_dwell_ms: totalDwell,
      zoom_count: cur?.zoomCount ?? 0,
      page_turn_count: cur?.pageTurnCount ?? 0,
      revisit_count: cur?.revisitCount ?? 0,
      selected_tag_count: (cur?.selectedTags ?? []).length,
    })
  }

  // Pause dwell timer when tab becomes hidden
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now()
      } else if (hiddenAt) {
        viewStartTsRef.current += performance.now() - hiddenAt
        hiddenAt = 0
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // -------- transitions ---------
  function start() {
    send('session_start', { listings_count: listings.length })
    setScreen('swipe')
  }

  function advance(dir: 'prev' | 'next') {
    if (!currentListing) return
    recordViewEnd()
    send('property_navigate', { property_id: currentListing.id, direction: dir })

    if (dir === 'prev') {
      if (currentIndex === 0) return
      setCurrentIndex((i) => i - 1)
      return
    }
    if (currentIndex >= listings.length - 1) {
      proceedToEnd()
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  function handleReact(reaction: Reaction) {
    if (!currentListing) return
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const next = { ...prev }
      next[currentListing.id] = { ...cur, reaction }
      return next
    })
    send('reaction', {
      property_id: currentListing.id,
      reaction,
      selected_tags: perProperty[currentListing.id]?.selectedTags ?? [],
    })
    // advance after react (acts like a "next" with recorded reaction)
    recordViewEnd()
    if (currentIndex >= listings.length - 1) {
      proceedToEnd()
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  function handleToggleTag(label: string) {
    if (!currentListing) return
    let newList: string[] = []
    let nowOn = false
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const setTags = new Set(cur.selectedTags)
      if (setTags.has(label)) {
        setTags.delete(label)
        nowOn = false
      } else {
        setTags.add(label)
        nowOn = true
      }
      newList = Array.from(setTags)
      const next = { ...prev }
      next[currentListing.id] = { ...cur, selectedTags: newList }
      return next
    })
    send('tag_selected', {
      property_id: currentListing.id,
      tag_code: label,
      polarity: 'pos',
      selected: nowOn,
      total_selected: newList.length,
    })
  }

  function handlePageTurn(fromPage: number, toPage: number) {
    if (!currentListing) return
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const next = { ...prev }
      next[currentListing.id] = { ...cur, pageTurnCount: cur.pageTurnCount + 1 }
      return next
    })
    send('property_page_turn', {
      property_id: currentListing.id,
      from_page: fromPage + 1,
      to_page: toPage + 1,
    })
  }

  function handleZoom() {
    if (!currentListing) return
    setPerProperty((prev) => {
      const cur = prev[currentListing.id]
      const next = { ...prev }
      next[currentListing.id] = { ...cur, zoomCount: cur.zoomCount + 1 }
      return next
    })
    send('property_zoom', {
      property_id: currentListing.id,
      zoom_level: 2.0,
      source: 'dbltap',
    })
  }

  function proceedToEnd() {
    // Compute predicted ranking from likes only
    const likeIds = listings
      .filter((l) => perProperty[l.id]?.reaction === 'like')
      .map((l) => l.id)
    const ranked = likeIds
      .map((id) => {
        const p = perProperty[id]
        return {
          id,
          score: predictedScore({
            reaction: p.reaction,
            dwellMs: p.dwellMs,
            zoomCount: p.zoomCount,
            pageTurnCount: p.pageTurnCount,
            selectedTags: p.selectedTags,
          }),
        }
      })
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id)
    setFinalRanking(ranked)
    setScreen('done')
  }

  async function handleSubmit() {
    const results: PerListingResult[] = listings
      .filter((l) => perProperty[l.id]?.reaction != null)
      .map((l) => {
        const p = perProperty[l.id]
        return {
          listingId: l.id,
          reaction: p.reaction as Reaction,
          selectedTags: p.selectedTags,
          dwellMs: p.dwellMs,
          zoomCount: p.zoomCount,
          pageTurnCount: p.pageTurnCount,
          revisitCount: p.revisitCount,
        }
      })

    if (comment.trim()) {
      send('comment_submitted', {
        property_id: finalRanking[0] ?? null,
        comment_length: comment.trim().length,
      })
    }
    const totalDwell = Object.values(perProperty).reduce((s, p) => s + p.dwellMs, 0)
    const likeCount = results.filter((r) => r.reaction === 'like').length
    const passCount = results.filter((r) => r.reaction === 'pass').length
    send('session_complete', {
      total_dwell_ms: Math.round(totalDwell),
      liked_count: likeCount,
      pass_count: passCount,
      top_id: finalRanking[0] ?? null,
    })

    await submitConfirmation({
      proposalId,
      results,
      finalRanking,
      rankingComment: comment.trim(),
    })
  }

  function handleRestart() {
    setPerProperty(makePerPropertyInitial(listings))
    setCurrentIndex(0)
    setFinalRanking([])
    setComment('')
    setScreen('welcome')
  }

  // -------- render ---------
  if (screen === 'welcome') {
    return (
      <WelcomeHero
        customerName={customerName}
        listingCount={listings.length}
        onStart={start}
      />
    )
  }

  if (screen === 'swipe' && currentListing) {
    const cardListing: SwipeCardListing = {
      id: currentListing.id,
      title: currentListing.title,
      pages: currentListing.pages,
      highlightTags: currentListing.highlightTags,
    }
    const cur = perProperty[currentListing.id]
    return (
      <SwipeCardV2
        listing={cardListing}
        currentIndex={currentIndex}
        total={listings.length}
        prevReaction={cur?.reaction ?? null}
        selectedTags={cur?.selectedTags ?? []}
        canGoPrev={currentIndex > 0}
        canGoNext={currentIndex < listings.length - 1}
        onReact={handleReact}
        onToggleTag={handleToggleTag}
        onNavigate={advance}
        onPageTurn={handlePageTurn}
        onZoom={handleZoom}
      />
    )
  }

  // screen === 'done'
  const rankingItems: RankingListing[] = finalRanking
    .map((id) => {
      const l = listings.find((x) => x.id === id)
      if (!l) return null
      return {
        id: l.id,
        title: l.title,
        thumbnailUrl: l.pages[0]?.image_url ?? '',
      }
    })
    .filter((v): v is RankingListing => v != null)

  return (
    <PredictedRanking
      customerName={customerName}
      items={rankingItems}
      initialOrder={finalRanking}
      initialComment={comment}
      alreadyCompleted={!!completedAt}
      onOrderChange={(newOrder, changedId, newPosition) => {
        setFinalRanking(newOrder)
        send('ranking_changed', { property_id: changedId, new_position: newPosition })
      }}
      onCommentChange={(c) => setComment(c)}
      onSubmit={handleSubmit}
      onRestart={handleRestart}
    />
  )
}
