'use client'

/**
 * ListingDetailModal
 *   Opens when a broker clicks a lane in the session timeline. Renders the
 *   listing's maisoku page(s) big, with a heatmap overlay showing where the
 *   customer looked during zoom-mode sessions. Per-page tabs for multi-page
 *   maisoku.
 *
 *   The heatmap is drawn on a <canvas> by accumulating radial gaussians at
 *   every zoom_mode_sample (center_x_pct, center_y_pct) — brighter = more
 *   attention. Samples are filtered per-page.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SwipeEvent } from '@/lib/database.types'
import type { ListingWithThumb } from './proposal-dashboard'

interface Sample {
  t_offset_ms: number
  scale: number
  center_x_pct: number
  center_y_pct: number
  page_index: number  // 1-based
}

interface ListingDetailModalProps {
  open: boolean
  listing: ListingWithThumb | null
  events: SwipeEvent[]  // already filtered to this listing
  onClose: () => void
}

export function ListingDetailModal(props: ListingDetailModalProps) {
  // Key-based remount when the listing changes so local state (page/mode)
  // resets cleanly without a setState-in-effect.
  return <ListingDetailModalInner key={props.listing?.id ?? 'empty'} {...props} />
}

function ListingDetailModalInner({ open, listing, events, onClose }: ListingDetailModalProps) {
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<'heatmap' | 'path'>('heatmap')
  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Parse all samples from zoom_mode_sample batches
  const samples = useMemo<Sample[]>(() => {
    const out: Sample[] = []
    for (const ev of events) {
      if (ev.event_name !== 'zoom_mode_sample') continue
      const p = (ev.params ?? {}) as Record<string, unknown>
      const batch = (p.batch ?? []) as Array<Record<string, unknown>>
      for (const s of batch) {
        out.push({
          t_offset_ms: typeof s.t_offset_ms === 'number' ? (s.t_offset_ms as number) : 0,
          scale: typeof s.scale === 'number' ? (s.scale as number) : 1,
          center_x_pct: typeof s.center_x_pct === 'number' ? (s.center_x_pct as number) : 0.5,
          center_y_pct: typeof s.center_y_pct === 'number' ? (s.center_y_pct as number) : 0.5,
          page_index: typeof s.page_index === 'number' ? (s.page_index as number) : 1,
        })
      }
    }
    return out.sort((a, b) => a.t_offset_ms - b.t_offset_ms)
  }, [events])

  // Summary stats per page
  const pageStats = useMemo(() => {
    const stats: { count: number; maxScale: number; durationMs: number }[] = []
    if (!listing) return stats
    for (let i = 0; i < Math.max(1, listing.pages.length); i++) {
      stats.push({ count: 0, maxScale: 1, durationMs: 0 })
    }
    for (const s of samples) {
      const idx = Math.max(0, Math.min(stats.length - 1, s.page_index - 1))
      stats[idx].count += 1
      if (s.scale > stats[idx].maxScale) stats[idx].maxScale = s.scale
    }
    // Each sample covers ~200ms of attention
    stats.forEach((st) => { st.durationMs = st.count * 200 })
    return stats
  }, [samples, listing])

  const samplesForCurrentPage = useMemo(
    () => samples.filter((s) => s.page_index === page + 1),
    [samples, page],
  )

  if (!open || !listing || typeof document === 'undefined') return null

  const currentImage = listing.pages[page]?.image_url ?? listing.thumbnailUrl
  const pageCount = Math.max(1, listing.pages.length)

  const node = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/92 text-white"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label="閉じる"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '22px' }}>close</span>
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-[14px] font-medium">
          {listing.title}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('heatmap')}
            className={`rounded-full px-2.5 py-1 ${mode === 'heatmap' ? 'bg-white text-black' : 'text-white/70'}`}
          >
            ヒートマップ
          </button>
          <button
            type="button"
            onClick={() => setMode('path')}
            className={`rounded-full px-2.5 py-1 ${mode === 'path' ? 'bg-white text-black' : 'text-white/70'}`}
          >
            軌跡
          </button>
        </div>
      </header>

      {/* Image + overlay */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-2">
        <div className="relative flex max-h-full max-w-full items-center justify-center">
          {currentImage && (
            <ImageWithHeatmap
              imageUrl={currentImage}
              samples={samplesForCurrentPage}
              mode={mode}
            />
          )}
        </div>
      </div>

      {/* Footer: page tabs + stats */}
      <footer className="border-t border-white/10 bg-black/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-center gap-1">
          {Array.from({ length: pageCount }).map((_, i) => {
            const st = pageStats[i]
            const on = i === page
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${
                  on ? 'border-white bg-white text-black' : 'border-white/20 text-white/70 hover:bg-white/5'
                }`}
              >
                <span>ページ {i + 1}</span>
                {st && st.count > 0 && (
                  <span className="opacity-70">
                    · {formatDuration(st.durationMs)} · 最大{st.maxScale.toFixed(1)}x
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {samples.length === 0 && (
          <p className="text-center text-[11px] text-white/50">
            この物件でのズーム操作はまだ記録されていません。顧客がマイソクを拡大するとここに軌跡が表示されます。
          </p>
        )}
      </footer>
    </div>
  )

  return createPortal(node, document.body)
}

// ---------------------------------------------------------------------------
// Image + canvas heatmap/path overlay
// ---------------------------------------------------------------------------

function ImageWithHeatmap({
  imageUrl,
  samples,
  mode,
}: {
  imageUrl: string
  samples: Sample[]
  mode: 'heatmap' | 'path'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const img = el.querySelector('img')
      if (!img) return
      setDims({ w: img.clientWidth, h: img.clientHeight })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dims.w === 0 || dims.h === 0) return
    canvas.width = dims.w
    canvas.height = dims.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, dims.w, dims.h)

    if (mode === 'heatmap') {
      // Radial gradient accumulation — brighter = more time spent
      for (const s of samples) {
        const x = s.center_x_pct * dims.w
        const y = s.center_y_pct * dims.h
        const radius = Math.max(25, (0.08 * Math.max(dims.w, dims.h)) / Math.max(1, s.scale * 0.7))
        const grd = ctx.createRadialGradient(x, y, 0, x, y, radius)
        grd.addColorStop(0, 'rgba(255, 80, 0, 0.18)')
        grd.addColorStop(0.6, 'rgba(255, 180, 0, 0.08)')
        grd.addColorStop(1, 'rgba(255, 255, 0, 0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (mode === 'path') {
      // Sequential path: line + numbered circles
      if (samples.length === 0) return
      ctx.strokeStyle = 'rgba(43, 93, 228, 0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      samples.forEach((s, i) => {
        const x = s.center_x_pct * dims.w
        const y = s.center_y_pct * dims.h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      // Start + end markers
      const first = samples[0]
      const last = samples[samples.length - 1]
      drawPathDot(ctx, first.center_x_pct * dims.w, first.center_y_pct * dims.h, '#16a34a', 'S')
      drawPathDot(ctx, last.center_x_pct * dims.w, last.center_y_pct * dims.h, '#e53935', 'E')
    }
  }, [dims, samples, mode])

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="max-h-[calc(100dvh-180px)] max-w-full object-contain"
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{ width: dims.w, height: dims.h }}
      />
    </div>
  )
}

function drawPathDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px ui-sans-serif, system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y)
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0秒'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${s}秒`
}
