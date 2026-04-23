'use client'

import Image from 'next/image'
import type { SwipeEvent } from '@/lib/database.types'

export interface TimelineListing {
  id: string
  title: string
  thumbnailUrl: string | null
}

interface SessionTimelineProps {
  events: SwipeEvent[]              // ascending by ts
  listings: Map<string, TimelineListing>
  listingOrder?: string[]           // display order (default: first-seen order)
}

interface ViewSegment {
  startMs: number
  endMs: number
  markers: Marker[]
  pageAtStart: number
  pagesVisited: number[]            // in order, starting from pageAtStart
}

interface Marker {
  t: number                         // absolute ms
  kind: 'zoom' | 'tag' | 'page_turn' | 'reaction' | 'revisit' | 'rank'
  label?: string                    // e.g. tag name, reaction, page turn "1→2"
  x?: number                        // 0..1 within image (for zoom)
  y?: number                        // 0..1 within image (for zoom)
}

interface Lane {
  listingId: string
  segments: ViewSegment[]
  endReaction: 'like' | 'pass' | null
  selectedTags: string[]
  firstSeenMs: number
}

export function SessionTimeline({ events, listings, listingOrder }: SessionTimelineProps) {
  const parsed = events.map((e) => ({ ...e, tsMs: new Date(e.ts).getTime() }))
  if (parsed.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        イベント履歴がありません
      </div>
    )
  }

  const sessionMin = parsed[0].tsMs
  const sessionMax = parsed[parsed.length - 1].tsMs
  const totalMs = Math.max(1, sessionMax - sessionMin)

  // Group events per listing → build lanes
  const laneMap = new Map<string, Lane>()
  const getLane = (lid: string) => {
    let l = laneMap.get(lid)
    if (!l) {
      l = { listingId: lid, segments: [], endReaction: null, selectedTags: [], firstSeenMs: Infinity }
      laneMap.set(lid, l)
    }
    return l
  }

  let currentListingId: string | null = null
  let currentSegment: ViewSegment | null = null

  for (const ev of parsed) {
    const params = (ev.params ?? {}) as Record<string, unknown>
    const propId = (params.property_id as string | undefined) ?? ev.listing_id ?? null
    const rel = ev.tsMs - sessionMin

    switch (ev.event_name) {
      case 'property_view_start': {
        if (!propId) break
        currentListingId = propId
        const lane = getLane(propId)
        lane.firstSeenMs = Math.min(lane.firstSeenMs, ev.tsMs)
        currentSegment = {
          startMs: ev.tsMs,
          endMs: ev.tsMs,
          markers: [],
          pageAtStart: 1,
          pagesVisited: [1],
        }
        lane.segments.push(currentSegment)
        break
      }
      case 'property_view_end': {
        if (currentSegment) currentSegment.endMs = ev.tsMs
        currentSegment = null
        currentListingId = null
        break
      }
      case 'property_zoom': {
        const x = typeof params.zoom_x_pct === 'number' ? (params.zoom_x_pct as number) : undefined
        const y = typeof params.zoom_y_pct === 'number' ? (params.zoom_y_pct as number) : undefined
        if (currentSegment) {
          currentSegment.markers.push({ t: ev.tsMs, kind: 'zoom', x, y, label: params.source as string })
        }
        break
      }
      case 'property_page_turn': {
        if (currentSegment) {
          const to = (params.to_page as number | undefined) ?? 0
          currentSegment.markers.push({ t: ev.tsMs, kind: 'page_turn', label: `${params.from_page}→${params.to_page}` })
          if (to) currentSegment.pagesVisited.push(to)
        }
        break
      }
      case 'tag_selected': {
        const on = params.selected !== false
        if (on && currentSegment) {
          currentSegment.markers.push({ t: ev.tsMs, kind: 'tag', label: params.tag_code as string })
          const lane = currentListingId ? getLane(currentListingId) : null
          if (lane) lane.selectedTags = Array.from(new Set([...lane.selectedTags, params.tag_code as string]))
        }
        break
      }
      case 'reaction': {
        if (propId) {
          const lane = getLane(propId)
          lane.endReaction = params.reaction as 'like' | 'pass'
          if (currentSegment) {
            currentSegment.markers.push({ t: ev.tsMs, kind: 'reaction', label: params.reaction as string })
          }
        }
        break
      }
      case 'property_revisit': {
        if (currentSegment) {
          currentSegment.markers.push({ t: ev.tsMs, kind: 'revisit' })
        }
        break
      }
      case 'ranking_changed': {
        if (propId) {
          getLane(propId).firstSeenMs = Math.min(getLane(propId).firstSeenMs, ev.tsMs)
        }
        break
      }
      default:
        break
    }
    void rel
  }

  // Finalize: any open segment (customer left without sending view_end)
  if (currentSegment && currentSegment.endMs === currentSegment.startMs) {
    currentSegment.endMs = sessionMax
  }

  // Ordering: respect listingOrder if provided; fall back to firstSeenMs ASC
  const order = listingOrder && listingOrder.length
    ? listingOrder
    : Array.from(laneMap.values())
        .sort((a, b) => a.firstSeenMs - b.firstSeenMs)
        .map((l) => l.listingId)

  const rows = order
    .map((lid) => ({ lane: laneMap.get(lid), listing: listings.get(lid) }))
    .filter(({ lane, listing }) => !!lane && !!listing) as { lane: Lane; listing: TimelineListing }[]

  const secLabels = buildSecLabels(totalMs)

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span>
          セッション: <b className="text-foreground">{formatDuration(totalMs)}</b>
        </span>
        <span>0:00 — {formatDuration(totalMs)}</span>
      </div>

      <div className="divide-y">
        {rows.map(({ lane, listing }) => (
          <TimelineRow
            key={lane.listingId}
            lane={lane}
            listing={listing}
            sessionMin={sessionMin}
            totalMs={totalMs}
          />
        ))}
      </div>

      {/* Time axis */}
      <div className="relative border-t px-4 py-2">
        <div
          className="relative h-4 pl-[156px]"
          // leave room for the label column on the left
        >
          {secLabels.map((s) => (
            <div
              key={s.ms}
              className="absolute top-0 -translate-x-1/2 text-[10px] text-gray-400"
              style={{ left: `calc(${(s.ms / totalMs) * 100}% )` }}
            >
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TimelineRow({
  lane,
  listing,
  sessionMin,
  totalMs,
}: {
  lane: Lane
  listing: TimelineListing
  sessionMin: number
  totalMs: number
}) {
  const reactionBadge =
    lane.endReaction === 'like' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
        ◎
      </span>
    ) : lane.endReaction === 'pass' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        ✕
      </span>
    ) : null

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Left label: thumb + title + badge */}
      <div className="flex w-[148px] flex-shrink-0 items-center gap-2">
        {listing.thumbnailUrl ? (
          <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
            <Image src={listing.thumbnailUrl} alt="" fill sizes="56px" className="object-cover" />
          </div>
        ) : (
          <div className="h-10 w-14 flex-shrink-0 rounded-md bg-gray-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{listing.title}</div>
          <div className="mt-0.5">{reactionBadge}</div>
        </div>
      </div>

      {/* Track */}
      <div className="relative h-8 flex-1 rounded bg-gray-50">
        {/* view segments */}
        {lane.segments.map((seg, i) => {
          const leftPct = ((seg.startMs - sessionMin) / totalMs) * 100
          const widthPct = Math.max(0.5, ((seg.endMs - seg.startMs) / totalMs) * 100)
          return (
            <div key={`seg-${i}`}>
              <div
                className="absolute top-1 h-6 rounded bg-blue-100"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                }}
                title={`${formatDuration(seg.startMs - sessionMin)} — ${formatDuration(seg.endMs - sessionMin)} (${formatDuration(seg.endMs - seg.startMs)})`}
              />
              {/* markers inside segment */}
              {seg.markers.map((m, mi) => {
                const mLeftPct = ((m.t - sessionMin) / totalMs) * 100
                return <MarkerPin key={`m-${i}-${mi}`} marker={m} leftPct={mLeftPct} />
              })}
            </div>
          )
        })}
      </div>

      {/* Right stats */}
      <div className="flex w-[96px] flex-shrink-0 flex-col items-end text-[10px] text-gray-500">
        <div>{formatDuration(lane.segments.reduce((s, x) => s + (x.endMs - x.startMs), 0))}</div>
        {lane.selectedTags.length > 0 && (
          <div className="flex max-w-[96px] flex-wrap justify-end gap-0.5 pt-0.5">
            {lane.selectedTags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-blue-50 px-1 py-px text-[9px] text-blue-600">
                {t}
              </span>
            ))}
            {lane.selectedTags.length > 3 && (
              <span className="text-[9px] text-gray-400">+{lane.selectedTags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MarkerPin({ marker, leftPct }: { marker: Marker; leftPct: number }) {
  const style: React.CSSProperties = { left: `${leftPct}%` }
  switch (marker.kind) {
    case 'zoom':
      return (
        <div
          className="absolute top-0 -translate-x-1/2 text-amber-500"
          style={style}
          title={`ズーム (${marker.label ?? '-'}${
            typeof marker.x === 'number' ? ` @x=${(marker.x * 100).toFixed(0)}% y=${(marker.y ?? 0) * 100 | 0}%` : ''
          })`}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
            star
          </span>
        </div>
      )
    case 'tag':
      return (
        <div
          className="absolute top-0 -translate-x-1/2 text-blue-500"
          style={style}
          title={`タグ: ${marker.label ?? ''}`}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
            label
          </span>
        </div>
      )
    case 'page_turn':
      return (
        <div
          className="absolute top-[18px] -translate-x-1/2 text-gray-500"
          style={style}
          title={`ページ ${marker.label}`}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '13px' }}>
            swap_horiz
          </span>
        </div>
      )
    case 'reaction':
      return (
        <div
          className={`absolute top-[-2px] -translate-x-1/2 ${marker.label === 'like' ? 'text-green-600' : 'text-red-500'}`}
          style={style}
          title={marker.label === 'like' ? '気になる' : '違うかな'}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
            {marker.label === 'like' ? 'thumb_up' : 'thumb_down'}
          </span>
        </div>
      )
    case 'revisit':
      return (
        <div className="absolute top-[18px] -translate-x-1/2 text-purple-500" style={style} title="再閲覧">
          <span className="material-symbols-rounded" style={{ fontSize: '12px' }}>
            replay
          </span>
        </div>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const sec = Math.round(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildSecLabels(totalMs: number): { ms: number; label: string }[] {
  const totalSec = Math.ceil(totalMs / 1000)
  let step: number
  if (totalSec <= 30) step = 5
  else if (totalSec <= 120) step = 15
  else if (totalSec <= 300) step = 30
  else if (totalSec <= 600) step = 60
  else step = 120
  const out: { ms: number; label: string }[] = []
  for (let s = 0; s <= totalSec; s += step) {
    out.push({ ms: s * 1000, label: formatDuration(s * 1000) })
  }
  return out
}
