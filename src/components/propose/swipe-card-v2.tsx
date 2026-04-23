'use client'

import { useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import Image from 'next/image'
import { tagsForListing, formatCardTitle } from '@/lib/propose-tags'

export type Reaction = 'like' | 'pass'

export interface SwipeCardListing {
  id: string
  title: string
  pages: { image_url: string; width: number | null; height: number | null }[]
  highlightTags: string[]
}

/**
 * Fired when the customer's gesture indicates they want to zoom in.
 * Instead of applying CSS scale on the card itself, the parent opens a
 * dedicated fullscreen ZoomViewer where pan/pinch/telemetry happen.
 */
export interface ZoomInfo {
  source: 'tap' | 'wheel' | 'pinch' | 'key'
  xPct: number     // 0..1 — horizontal focal point within the image area
  yPct: number     // 0..1 — vertical focal point
  pageIndex: number
}

interface SwipeCardV2Props {
  listing: SwipeCardListing
  currentIndex: number
  total: number
  prevReaction: Reaction | null
  selectedTags: string[]
  canGoPrev: boolean
  canGoNext: boolean
  onReact: (reaction: Reaction) => void
  onToggleTag: (label: string) => void
  onNavigate: (direction: 'prev' | 'next') => void
  onZoom: (info: ZoomInfo) => void
}

// Remount when the listing changes so card-local state (pageIdx, x offset,
// gesture buffers) resets cleanly without a setState-in-effect.
export function SwipeCardV2(props: SwipeCardV2Props) {
  return <SwipeCardV2Inner key={props.listing.id} {...props} />
}

function SwipeCardV2Inner({
  listing,
  currentIndex,
  total,
  prevReaction,
  selectedTags,
  canGoPrev,
  canGoNext,
  onReact,
  onToggleTag,
  onNavigate,
  onZoom,
}: SwipeCardV2Props) {
  // Page navigation for multi-page maisoku lives only inside the ZoomViewer
  // now; the card just shows page 1 at a glance.
  const pageIdx = 0
  const [moving, setMoving] = useState(false)

  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-12, 0, 12])
  const likeHintOpacity = useTransform(x, [40, 120], [0, 1])
  const passHintOpacity = useTransform(x, [-120, -40], [1, 0])

  const chips = tagsForListing(listing.highlightTags)
  const selected = new Set(selectedTags)
  const pageCount = listing.pages.length

  // (key-based remount in parent handles listing.id changes; no effect needed)

  const handleDragEnd = (
    _: unknown,
    info: { offset: { x: number }; velocity: { x: number } },
  ) => {
    const TH = 90
    const fastLike = info.velocity.x > 500
    const fastPass = info.velocity.x < -500
    if (info.offset.x > TH || fastLike) {
      setMoving(true)
      animate(x, 500, { duration: 0.25 })
      setTimeout(() => {
        onReact('like')
        x.set(0)
        setMoving(false)
      }, 250)
    } else if (info.offset.x < -TH || fastPass) {
      setMoving(true)
      animate(x, -500, { duration: 0.25 })
      setTimeout(() => {
        onReact('pass')
        x.set(0)
        setMoving(false)
      }, 250)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }
  }

  /** Normalized (0..1) position of a pointer within `el`. */
  function positionWithin(el: HTMLElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect()
    const xPct = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0.5
    const yPct = rect.height > 0 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.5
    return { xPct, yPct }
  }

  /** Open the fullscreen zoom viewer. Parent owns state/telemetry. */
  function requestZoom(source: 'tap' | 'wheel' | 'pinch', xPct: number, yPct: number) {
    onZoom({ source, xPct, yPct, pageIndex: pageIdx })
  }

  // Any tap on the maisoku image enters the fullscreen zoom viewer.
  // The hint badge above the image says "タップで拡大" so this matches what the
  // customer expects; page navigation inside a multi-page maisoku is handled
  // by the viewer's own footer, not by tapping the card.
  const onImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const { xPct, yPct } = positionWithin(e.currentTarget, e.clientX, e.clientY)
    requestZoom('tap', xPct, yPct)
  }

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    if (e.deltaY >= -10) return
    const { xPct, yPct } = positionWithin(e.currentTarget, e.clientX, e.clientY)
    requestZoom('wheel', xPct, yPct)
  }

  // Pinch gesture on the card also enters zoom mode
  const pinchStartDist = useRef<number>(0)
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      pinchStartDist.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchStartDist.current) return
    const [a, b] = [e.touches[0], e.touches[1]]
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (d / pinchStartDist.current > 1.15) {
      const midX = (a.clientX + b.clientX) / 2
      const midY = (a.clientY + b.clientY) / 2
      const { xPct, yPct } = positionWithin(e.currentTarget, midX, midY)
      requestZoom('pinch', xPct, yPct)
      pinchStartDist.current = 0
    }
  }
  const onTouchEnd = () => {
    pinchStartDist.current = 0
  }

  // ---------- buttons ----------
  const triggerReact = (r: Reaction) => {
    if (moving) return
    setMoving(true)
    const target = r === 'like' ? 500 : -500
    animate(x, target, { duration: 0.25 })
    setTimeout(() => {
      onReact(r)
      x.set(0)
      setMoving(false)
    }, 250)
  }

  const currentImage = listing.pages[pageIdx]?.image_url
  const likeReacted = prevReaction === 'like'
  const passReacted = prevReaction === 'pass'

  return (
    <div className="propose-body mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#f7f7f8] pb-10 md:h-auto md:max-w-[960px] md:py-6">
      {/* Progress */}
      <header className="px-5 pb-2 pt-4 md:px-8">
        <div className="flex items-center gap-2.5 text-[12px] text-gray-400">
          <span>
            {currentIndex + 1} / {total}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gray-900 transition-[width] duration-300"
              style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* Card area */}
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden px-4 pb-1 pt-2 md:flex-none md:px-8 md:pb-4 md:pt-4">
        <motion.div
          style={{ x, rotate }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.8}
          onDragEnd={handleDragEnd}
          className="relative flex h-full w-full touch-none select-none flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(20,20,30,0.10)] md:h-[min(620px,calc(100dvh-240px))] md:flex-row"
        >
          {/* swipe direction hints */}
          <motion.div
            style={{ opacity: likeHintOpacity }}
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border-2 border-green-600 bg-white/85 px-3 py-1.5 text-xs font-bold text-green-600 rotate-12"
          >
            <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
              thumb_up
            </span>
            気になる
          </motion.div>
          <motion.div
            style={{ opacity: passHintOpacity }}
            className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border-2 border-red-500 bg-white/85 px-3 py-1.5 text-xs font-bold text-red-500 -rotate-12"
          >
            <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
              thumb_down
            </span>
            違うかな
          </motion.div>

          {/* Image area — 16:9 on mobile (stacked), ~60% width on desktop (side-by-side) */}
          <div
            className="swipe-image-wrap relative flex w-full flex-shrink-0 cursor-zoom-in items-center justify-center bg-[#f0f0f3] md:aspect-auto md:h-full md:w-[60%]"
            style={{ aspectRatio: '16 / 9' }}
            onClick={onImageClick}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {currentImage ? (
              <Image
                src={currentImage}
                alt={listing.title}
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-contain pointer-events-none"
                draggable={false}
                priority
              />
            ) : null}
            {/* Persistent hint so the customer notices tap-to-zoom */}
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                zoom_in
              </span>
              タップで拡大
            </div>
            {pageCount > 1 && (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] text-white">
                {pageIdx + 1} / {pageCount}
              </div>
            )}
          </div>

          {/* Body: title, tag hint, chips — stacked below on mobile, right column on desktop */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto border-t border-gray-200 px-4 py-4 md:w-[40%] md:flex-shrink-0 md:border-l md:border-t-0 md:px-6 md:py-5">
            <div>
              <h2 className="m-0 text-[18px] font-bold text-gray-900 md:text-[20px]">
                {formatCardTitle(listing.title, pageIdx, pageCount)}
              </h2>
            </div>

            <p className="m-0 inline-flex items-center gap-1 text-[11px] text-gray-400">
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                touch_app
              </span>
              気になったキーワードをタップ
            </p>

            <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
              {chips.map((t) => {
                const on = selected.has(t.label)
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleTag(t.label)
                    }}
                    className={[
                      'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.96]',
                      on
                        ? 'border-[#2b5de4] bg-[#eef1ff] text-[#2b5de4]'
                        : 'border-transparent bg-[#f3f4f8] text-gray-500',
                    ].join(' ')}
                  >
                    <span
                      className="material-symbols-rounded"
                      style={{ fontSize: '17px', color: on ? '#2b5de4' : '#9a9aa5' }}
                    >
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* 2-way reaction buttons */}
      <nav className="flex items-center justify-center gap-2.5 px-4 pb-2 pt-2.5 md:mx-auto md:w-full md:max-w-[640px] md:px-8 md:pt-4">
        <button
          type="button"
          onClick={() => triggerReact('pass')}
          disabled={moving}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-full border bg-white px-2 py-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97]',
            passReacted ? 'border-2 border-red-500 bg-red-50 font-bold text-gray-900' : 'border-gray-200 text-gray-500',
          ].join(' ')}
        >
          {passReacted && (
            <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
              check
            </span>
          )}
          <span className="material-symbols-rounded text-red-500" style={{ fontSize: '22px' }}>
            thumb_down
          </span>
          <span>違うかな</span>
        </button>
        <button
          type="button"
          onClick={() => triggerReact('like')}
          disabled={moving}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-full border bg-white px-2 py-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97]',
            likeReacted ? 'border-2 border-green-600 bg-green-50 font-bold text-gray-900' : 'border-gray-200 text-gray-500',
          ].join(' ')}
        >
          {likeReacted && (
            <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
              check
            </span>
          )}
          <span className="material-symbols-rounded text-green-600" style={{ fontSize: '22px' }}>
            thumb_up
          </span>
          <span>気になる</span>
        </button>
      </nav>

      {/* Desktop-only keyboard hint */}
      <p className="hidden pt-3 text-center text-[11px] text-gray-400 md:block">
        キーボード: <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">←</kbd> <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">→</kbd> 物件切替 ·
        <kbd className="ml-2 rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">K</kbd>/<kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">↑</kbd> 気になる ·
        <kbd className="ml-2 rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">J</kbd>/<kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">↓</kbd> 違うかな ·
        <kbd className="ml-2 rounded border border-gray-300 bg-gray-50 px-1.5 text-[10px]">Z</kbd> 拡大
      </p>

      {/* Prev / next navigation (chevron only, visual cue) */}
      <nav className="pointer-events-none flex items-center justify-between px-5 pb-4 pt-1 md:mx-auto md:w-full md:max-w-[640px] md:px-8">
        <button
          type="button"
          onClick={() => onNavigate('prev')}
          disabled={!canGoPrev || moving}
          aria-label="前の物件"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm disabled:opacity-30"
        >
          <span className="material-symbols-rounded">chevron_left</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('next')}
          disabled={!canGoNext || moving}
          aria-label="次の物件"
          className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm disabled:opacity-30"
        >
          <span className="material-symbols-rounded">chevron_right</span>
        </button>
      </nav>
    </div>
  )
}
