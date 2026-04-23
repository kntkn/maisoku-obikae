'use client'

/**
 * ZoomViewer
 *   Fullscreen viewer triggered when the customer pinches or double-taps a
 *   maisoku. Designed to be a distraction-free "photo viewer" UX so the
 *   customer can freely pinch/pan/look at any area of the image.
 *
 *   Deliberate constraints (per FANGO spec):
 *     - No navigation to other properties (close only)
 *     - Left/right swipe disabled (it belongs to the card layer, not here)
 *     - Page turn (↔) only if the maisoku has multiple pages
 *     - ESC / × / pinch-out-to-1x / drag-down-at-1x all close
 *
 *   Telemetry: emits zoom_mode_enter on open, zoom_mode_sample batches every
 *   ~200ms (flushed in groups of 5), and zoom_mode_exit on close. Each sample
 *   carries the normalized center of the visible region + current scale.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCardTitle } from '@/lib/propose-tags'

export interface ZoomEnterInfo {
  source: 'dbltap' | 'pinch' | 'wheel'
  startScale: number       // e.g. 2.0 for dbltap
  startXPct: number        // 0..1 focal-point within the image
  startYPct: number        // 0..1
  pageIndex: number        // 0-based
}

export interface ZoomSample {
  t_offset_ms: number
  scale: number
  center_x_pct: number
  center_y_pct: number
  page_index: number       // 1-based for analytics readability
}

interface ZoomViewerProps {
  open: boolean
  imageUrls: string[]
  listingTitle: string
  enterInfo: ZoomEnterInfo | null
  onClose: () => void
  onEvent: (name: string, params: Record<string, unknown>) => void
}

const MIN_SCALE = 1.0
const MAX_SCALE = 5.0
const SAMPLE_INTERVAL_MS = 200
const SAMPLE_BATCH_SIZE = 5
const CLOSE_ON_PINCH_SCALE = 0.98     // pinch-out below this closes
const CLOSE_ON_DRAG_DOWN_PX = 80

export function ZoomViewer({
  open,
  imageUrls,
  listingTitle,
  enterInfo,
  onClose,
  onEvent,
}: ZoomViewerProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // UI state — duplicated in refs below for the sampler (avoid stale closures)
  const [page, setPage] = useState(enterInfo?.pageIndex ?? 0)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  // Refs for the sampler and gesture math
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  const txRef = useRef(0)
  const tyRef = useRef(0)
  const pageRef = useRef(enterInfo?.pageIndex ?? 0)

  const maxScaleRef = useRef(1)
  const enteredAtRef = useRef(0)
  const samplerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sampleBufRef = useRef<ZoomSample[]>([])
  const samplesCountRef = useRef(0)
  const pageSwitchesRef = useRef(0)
  const closingRef = useRef(false)

  // Keep refs in sync with state for the sampler
  useEffect(() => { scaleRef.current = scale; maxScaleRef.current = Math.max(maxScaleRef.current, scale) }, [scale])
  useEffect(() => { txRef.current = tx }, [tx])
  useEffect(() => { tyRef.current = ty }, [ty])
  useEffect(() => { pageRef.current = page }, [page])

  // --- Event helpers -------------------------------------------------------
  const flushSamples = useCallback(() => {
    if (sampleBufRef.current.length === 0) return
    const batch = sampleBufRef.current.splice(0, sampleBufRef.current.length)
    onEvent('zoom_mode_sample', { batch, count: batch.length })
  }, [onEvent])

  // --- Open/close lifecycle -----------------------------------------------
  useEffect(() => {
    if (!open || !enterInfo) return

    // Reset per-session state
    closingRef.current = false
    enteredAtRef.current = performance.now()
    sampleBufRef.current = []
    samplesCountRef.current = 0
    pageSwitchesRef.current = 0
    maxScaleRef.current = enterInfo.startScale

    const initialPage = enterInfo.pageIndex
    setPage(initialPage)
    pageRef.current = initialPage

    // Apply initial transform — center the focal point at viewport center
    // tx = (0.5 - xPct) * scale * containerWidth
    const applyInitial = () => {
      const el = containerRef.current
      const w = el?.clientWidth ?? 1
      const h = el?.clientHeight ?? 1
      const s = enterInfo.startScale
      const initialTx = (0.5 - enterInfo.startXPct) * s * w
      const initialTy = (0.5 - enterInfo.startYPct) * s * h
      setScale(s)
      setTx(initialTx)
      setTy(initialTy)
      scaleRef.current = s
      txRef.current = initialTx
      tyRef.current = initialTy
    }
    // Wait a frame so the container has a real width/height
    requestAnimationFrame(applyInitial)

    onEvent('zoom_mode_enter', {
      page_index: initialPage + 1,
      trigger: enterInfo.source,
      start_scale: enterInfo.startScale,
      start_x_pct: enterInfo.startXPct,
      start_y_pct: enterInfo.startYPct,
    })

    samplerRef.current = setInterval(() => {
      const cx = currentCenterPct('x')
      const cy = currentCenterPct('y')
      sampleBufRef.current.push({
        t_offset_ms: Math.round(performance.now() - enteredAtRef.current),
        scale: Number(scaleRef.current.toFixed(2)),
        center_x_pct: Number(cx.toFixed(3)),
        center_y_pct: Number(cy.toFixed(3)),
        page_index: pageRef.current + 1,
      })
      samplesCountRef.current += 1
      if (sampleBufRef.current.length >= SAMPLE_BATCH_SIZE) flushSamples()
    }, SAMPLE_INTERVAL_MS)

    return () => {
      if (samplerRef.current) {
        clearInterval(samplerRef.current)
        samplerRef.current = null
      }
      flushSamples()
      onEvent('zoom_mode_exit', {
        duration_ms: Math.round(performance.now() - enteredAtRef.current),
        max_scale: Number(maxScaleRef.current.toFixed(2)),
        final_scale: Number(scaleRef.current.toFixed(2)),
        samples_count: samplesCountRef.current,
        page_switches: pageSwitchesRef.current,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enterInfo])

  // --- Math helpers --------------------------------------------------------
  function currentCenterPct(axis: 'x' | 'y'): number {
    const el = containerRef.current
    const s = scaleRef.current
    if (!el || s <= 0) return 0.5
    const size = axis === 'x' ? el.clientWidth : el.clientHeight
    const t = axis === 'x' ? txRef.current : tyRef.current
    const v = 0.5 - t / (s * Math.max(size, 1))
    return Math.max(0, Math.min(1, v))
  }

  function clampPan(nextTx: number, nextTy: number, s: number) {
    const el = containerRef.current
    const w = el?.clientWidth ?? 0
    const h = el?.clientHeight ?? 0
    const halfW = Math.max(0, (s - 1) * w) / 2
    const halfH = Math.max(0, (s - 1) * h) / 2
    return {
      tx: Math.max(-halfW, Math.min(halfW, nextTx)),
      ty: Math.max(-halfH, Math.min(halfH, nextTy)),
    }
  }

  function updateTransform(s: number, nextTx: number, nextTy: number) {
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s))
    const { tx: ctx, ty: cty } = clampPan(nextTx, nextTy, clampedScale)
    setScale(clampedScale)
    setTx(ctx)
    setTy(cty)
    scaleRef.current = clampedScale
    txRef.current = ctx
    tyRef.current = cty
    if (clampedScale > maxScaleRef.current) maxScaleRef.current = clampedScale
  }

  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    onClose()
  }

  // --- Touch gestures ------------------------------------------------------
  // State for the active gesture
  const gestureStart = useRef<{
    kind: 'pan' | 'pinch' | 'none'
    t0: number
    x0: number
    y0: number
    x1: number
    y1: number
    startTx: number
    startTy: number
    startScale: number
    startDist: number
    // Focal point (container-local) at gesture start — keeps the image point
    // under the fingers anchored as the user pinches.
    focalX: number
    focalY: number
  }>({ kind: 'none', t0: 0, x0: 0, y0: 0, x1: 0, y1: 0, startTx: 0, startTy: 0, startScale: 1, startDist: 0, focalX: 0, focalY: 0 })
  const lastTapRef = useRef(0)

  function dist(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by)
  }

  function toContainerPoint(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1]
      const p1 = toContainerPoint(a.clientX, a.clientY)
      const p2 = toContainerPoint(b.clientX, b.clientY)
      gestureStart.current = {
        kind: 'pinch',
        t0: performance.now(),
        x0: p1.x, y0: p1.y, x1: p2.x, y1: p2.y,
        startTx: txRef.current,
        startTy: tyRef.current,
        startScale: scaleRef.current,
        startDist: dist(p1.x, p1.y, p2.x, p2.y),
        focalX: (p1.x + p2.x) / 2,
        focalY: (p1.y + p2.y) / 2,
      }
    } else if (e.touches.length === 1) {
      const a = e.touches[0]
      const p = toContainerPoint(a.clientX, a.clientY)
      const now = Date.now()
      const dblTap = now - lastTapRef.current < 320
      lastTapRef.current = now
      if (dblTap) {
        // Toggle between 1x and 2.5x at the tap position
        if (scaleRef.current > 1.3) {
          updateTransform(1, 0, 0)
        } else {
          const el = containerRef.current
          const w = el?.clientWidth ?? 1
          const h = el?.clientHeight ?? 1
          const targetScale = 2.5
          const fx = p.x, fy = p.y
          // Re-anchor so the image point at (fx, fy) stays at (fx, fy) after zoom
          const imgX = (fx - w / 2 - txRef.current) / scaleRef.current
          const imgY = (fy - h / 2 - tyRef.current) / scaleRef.current
          const newTx = fx - w / 2 - targetScale * imgX
          const newTy = fy - h / 2 - targetScale * imgY
          updateTransform(targetScale, newTx, newTy)
        }
        gestureStart.current.kind = 'none'
        return
      }
      gestureStart.current = {
        kind: 'pan',
        t0: performance.now(),
        x0: p.x, y0: p.y, x1: 0, y1: 0,
        startTx: txRef.current,
        startTy: tyRef.current,
        startScale: scaleRef.current,
        startDist: 0,
        focalX: 0, focalY: 0,
      }
    }
  }

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault()
    const g = gestureStart.current
    if (g.kind === 'pinch' && e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1]
      const p1 = toContainerPoint(a.clientX, a.clientY)
      const p2 = toContainerPoint(b.clientX, b.clientY)
      const curDist = dist(p1.x, p1.y, p2.x, p2.y)
      if (g.startDist < 2) return
      const rawScale = g.startScale * (curDist / g.startDist)
      const el = containerRef.current
      const w = el?.clientWidth ?? 1
      const h = el?.clientHeight ?? 1
      // Re-anchor so the image point originally under the midpoint stays there
      const imgX = (g.focalX - w / 2 - g.startTx) / g.startScale
      const imgY = (g.focalY - h / 2 - g.startTy) / g.startScale
      const curFocalX = (p1.x + p2.x) / 2
      const curFocalY = (p1.y + p2.y) / 2
      const newTx = curFocalX - w / 2 - rawScale * imgX
      const newTy = curFocalY - h / 2 - rawScale * imgY

      if (rawScale < CLOSE_ON_PINCH_SCALE) {
        requestClose()
        return
      }
      updateTransform(rawScale, newTx, newTy)
    } else if (g.kind === 'pan' && e.touches.length === 1) {
      const p = toContainerPoint(e.touches[0].clientX, e.touches[0].clientY)
      const dx = p.x - g.x0
      const dy = p.y - g.y0
      if (scaleRef.current <= 1.05) {
        // At 1x, a firm drag-down closes the viewer
        if (dy > CLOSE_ON_DRAG_DOWN_PX && Math.abs(dy) > Math.abs(dx)) {
          requestClose()
          return
        }
        return
      }
      updateTransform(scaleRef.current, g.startTx + dx, g.startTy + dy)
    }
  }

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      gestureStart.current.kind = 'none'
    }
  }

  // --- Mouse / wheel (desktop) --------------------------------------------
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const p = toContainerPoint(e.clientX, e.clientY)
    const el = containerRef.current
    const w = el?.clientWidth ?? 1
    const h = el?.clientHeight ?? 1
    const imgX = (p.x - w / 2 - txRef.current) / scaleRef.current
    const imgY = (p.y - h / 2 - tyRef.current) / scaleRef.current
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleRef.current * factor))
    if (newScale < CLOSE_ON_PINCH_SCALE && factor < 1) {
      requestClose()
      return
    }
    const newTx = p.x - w / 2 - newScale * imgX
    const newTy = p.y - h / 2 - newScale * imgY
    updateTransform(newScale, newTx, newTy)
  }

  const mouseDownRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scaleRef.current <= 1.05) return
    mouseDownRef.current = { x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current }
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = mouseDownRef.current
      if (!d) return
      updateTransform(scaleRef.current, d.tx + (e.clientX - d.x), d.ty + (e.clientY - d.y))
    }
    function onUp() { mouseDownRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // --- Page navigation (internal only) ------------------------------------
  function goPage(dir: 'prev' | 'next') {
    const total = imageUrls.length
    const next = page + (dir === 'next' ? 1 : -1)
    if (next < 0 || next >= total) return
    pageSwitchesRef.current += 1
    setPage(next)
    pageRef.current = next
    // Reset transform on page turn so the new page starts at 1x centered
    updateTransform(1, 0, 0)
    onEvent('zoom_mode_page_turn', { from_page: page + 1, to_page: next + 1 })
  }

  // --- Render -------------------------------------------------------------
  if (!mounted || !open) return null
  const currentUrl = imageUrls[page]
  if (!currentUrl) return null

  const node = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 pb-2 pt-4 text-sm">
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="閉じる"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '24px' }}>close</span>
        </button>
        <div className="min-w-0 flex-1 truncate px-2 text-center text-[13px] font-medium opacity-80">
          {formatCardTitle(listingTitle, page, imageUrls.length)}
        </div>
        <div className="w-10 text-right text-[11px] text-white/60">
          {scale.toFixed(1)}x
        </div>
      </header>

      {/* Image viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentUrl}
          alt={listingTitle}
          draggable={false}
          className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: closingRef.current ? 'none' : undefined,
          }}
        />

        {/* Hints overlay (only at 1x, fades out) */}
        {scale <= 1.05 && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-[11px] text-white/70">
            ピンチで拡大 · 2本指でパン · ダブルタップで2.5倍
          </div>
        )}
      </div>

      {/* Footer — page nav only (no inter-property nav per spec) */}
      <footer className="flex items-center justify-between px-6 py-4">
        {imageUrls.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => goPage('prev')}
              disabled={page === 0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/20"
              aria-label="前のページ"
            >
              <span className="material-symbols-rounded">chevron_left</span>
            </button>
            <div className="text-[12px] text-white/70">
              {page + 1} / {imageUrls.length}
            </div>
            <button
              type="button"
              onClick={() => goPage('next')}
              disabled={page === imageUrls.length - 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/20"
              aria-label="次のページ"
            >
              <span className="material-symbols-rounded">chevron_right</span>
            </button>
          </>
        ) : (
          <div className="flex-1 text-center text-[11px] text-white/50">
            ×ボタン / 下にドラッグ / ピンチで縮小 で戻る
          </div>
        )}
      </footer>
    </div>
  )

  return createPortal(node, document.body)
}
