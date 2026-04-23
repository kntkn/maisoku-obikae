'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getPublicBaseUrl } from '@/lib/public-url'
import type {
  ProposalSet,
  PublishedListing,
  SwipeResult,
  SwipeEvent,
} from '@/lib/database.types'
import { SessionTimeline, type TimelineListing } from './session-timeline'
import { ListingDetailModal } from './listing-detail-modal'

export interface ListingPage {
  image_url: string
  width: number | null
  height: number | null
}

export type ListingWithThumb = PublishedListing & {
  thumbnailUrl: string | null
  pages: ListingPage[]
}

export interface ProposalDashboardData {
  proposal: ProposalSet
  listings: Map<string, ListingWithThumb>
  results: Map<string, SwipeResult>
  events: SwipeEvent[]   // ascending by ts
}

interface ProposalDashboardProps {
  data: ProposalDashboardData
  /** Show the "back to proposals" link + owner-only actions */
  variant?: 'owner' | 'shared'
}

export function ProposalDashboard({ data, variant = 'owner' }: ProposalDashboardProps) {
  const [showEvents, setShowEvents] = useState(false)
  const [detailListingId, setDetailListingId] = useState<string | null>(null)
  const nextHint = useMemo(() => buildNextHint(data), [data])
  const deviceSummary = useMemo(() => buildDeviceSummary(data.events), [data.events])

  const { proposal, listings, results, events } = data
  const ranked = proposal.final_ranking
  const likedResults = Array.from(results.values()).filter((r) => r.reaction === 'like')
  const passedResults = Array.from(results.values()).filter((r) => r.reaction === 'pass')
  const unseenIds = proposal.listing_ids.filter((id: string) => !results.has(id))
  const completed = !!proposal.completed_at

  const timelineListings = new Map<string, TimelineListing>()
  for (const [id, l] of listings.entries()) {
    timelineListings.set(id, { id, title: l.title, thumbnailUrl: l.thumbnailUrl })
  }
  const eventsAsc = events
  const eventsDesc = [...events].reverse()

  const copyCustomerUrl = async () => {
    await navigator.clipboard.writeText(
      `${getPublicBaseUrl()}/propose/${proposal.slug}`,
    )
    toast.success('お客様への提案URLをコピーしました')
  }
  const copyShareUrl = async () => {
    if (!proposal.share_token) {
      toast.error('共有URLがまだ発行されていません')
      return
    }
    await navigator.clipboard.writeText(
      `${getPublicBaseUrl()}/review/${proposal.share_token}`,
    )
    toast.success('チーム共有URLをコピーしました')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {variant === 'owner' && (
            <Link href="/proposals" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; 提案一覧
            </Link>
          )}
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{proposal.customer_name}</h2>
          <p className="text-muted-foreground">
            {proposal.listing_ids.length}物件 &middot;{' '}
            {new Date(proposal.created_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deviceSummary.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
              {deviceSummary.map((d, i) => (
                <span key={i} title={d.tooltip} className="inline-flex items-center gap-1">
                  <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                    {d.icon}
                  </span>
                  {d.label}
                  {d.count > 1 ? ` ×${d.count}` : ''}
                </span>
              ))}
            </div>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              completed
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {completed
              ? `回答済み (${new Date(proposal.completed_at!).toLocaleString('ja-JP')})`
              : '未回答'}
          </span>
          {variant === 'owner' && (
            <>
              <Button variant="outline" size="sm" onClick={copyCustomerUrl}>
                お客様URL
              </Button>
              <Button variant="outline" size="sm" onClick={copyShareUrl} disabled={!proposal.share_token}>
                チーム共有URL
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">行動タイムライン</h3>
          <p className="text-xs text-muted-foreground">
            <span className="material-symbols-rounded align-middle" style={{ fontSize: '12px' }}>star</span>
            ズーム ·
            <span className="material-symbols-rounded align-middle" style={{ fontSize: '12px' }}>label</span>
            タグ ·
            <span className="material-symbols-rounded align-middle" style={{ fontSize: '12px' }}>swap_horiz</span>
            ページ送り ·
            <span className="material-symbols-rounded align-middle" style={{ fontSize: '12px' }}>thumb_up</span>
            反応
          </p>
        </div>
        <SessionTimeline
          events={eventsAsc}
          listings={timelineListings}
          listingOrder={proposal.listing_ids}
          onLaneClick={(id) => setDetailListingId(id)}
        />
        <p className="mt-2 text-[11px] text-gray-400">
          行をクリックすると、その物件のマイソクとズーム軌跡が詳細で見られます。
        </p>
      </div>

      {/* Stats */}
      <Card>
        <CardContent className="grid grid-cols-4 gap-2 py-4 text-center">
          <Stat label="気になる" value={likedResults.length} color="text-green-600" />
          <Stat label="違うかな" value={passedResults.length} color="text-red-500" />
          <Stat label="未閲覧" value={unseenIds.length} color="text-gray-400" />
          <Stat
            label="合計滞在"
            value={formatSeconds(
              Array.from(results.values()).reduce((s, r) => s + (r.dwell_ms ?? 0), 0) / 1000,
            )}
            color="text-gray-700"
          />
        </CardContent>
      </Card>

      {/* Ranked */}
      {ranked.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">お客様が選んだランキング</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranked.map((lid: string, idx: number) => {
              const l = listings.get(lid)
              const r = results.get(lid)
              return <RankRow key={lid} rank={idx + 1} listing={l} result={r} emphasize={idx === 0} />
            })}
            {proposal.ranking_comment && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="text-xs font-semibold text-amber-700">1位の決め手:</span>{' '}
                {proposal.ranking_comment}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {completed ? 'お客様がランキングを送信しませんでした。' : 'まだお客様からの回答が届いていません。'}
          </CardContent>
        </Card>
      )}

      {/* Passed */}
      {passedResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-500">見送り物件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {passedResults.map((r) => {
              const l = listings.get(r.listing_id)
              return <PassRow key={r.listing_id} listing={l} result={r} />
            })}
          </CardContent>
        </Card>
      )}

      {/* Hint */}
      {nextHint && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">次回提案のヒント</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-gray-700">
              {nextHint.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-gray-400">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Per-listing detail modal — heatmap + full maisoku */}
      {detailListingId && (
        <ListingDetailModal
          open={!!detailListingId}
          listing={listings.get(detailListingId) ?? null}
          events={eventsAsc.filter((e) => {
            const p = (e.params ?? {}) as Record<string, unknown>
            return (e.listing_id ?? p.property_id) === detailListingId
          })}
          onClose={() => setDetailListingId(null)}
        />
      )}

      {/* Raw events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">イベント履歴 ({events.length}件)</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowEvents((v) => !v)}>
              {showEvents ? '隠す' : '表示'}
            </Button>
          </div>
        </CardHeader>
        {showEvents && (
          <CardContent>
            <div className="max-h-96 overflow-y-auto font-mono text-xs">
              {events.length === 0 && <p className="text-muted-foreground">イベントなし</p>}
              {eventsDesc.map((e) => {
                const l = e.listing_id ? listings.get(e.listing_id) : null
                return (
                  <div key={e.id} className="border-b border-gray-100 py-1">
                    <span className="text-gray-400">{new Date(e.ts).toLocaleTimeString('ja-JP')}</span>{' '}
                    <span className="font-semibold text-blue-600">{e.event_name}</span>{' '}
                    {l && <span className="text-gray-500">{l.title}</span>}{' '}
                    <span className="text-gray-500">{renderParams(e.params as Record<string, unknown>)}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function RankRow({
  rank,
  listing,
  result,
  emphasize,
}: {
  rank: number
  listing: ListingWithThumb | undefined
  result: SwipeResult | undefined
  emphasize: boolean
}) {
  const badgeBg =
    rank === 1
      ? 'bg-[#fff5d1] text-[#ad8400]'
      : rank === 2
      ? 'bg-[#eeeef2] text-[#62626d]'
      : rank === 3
      ? 'bg-[#f4e2d1] text-[#8a5028]'
      : 'bg-gray-100 text-gray-500'

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        emphasize ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'
      }`}
    >
      <div className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg font-bold ${badgeBg}`}>
        {rank}
      </div>
      {listing?.thumbnailUrl && (
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
          <Image src={listing.thumbnailUrl} alt="" fill sizes="48px" className="object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{listing?.title ?? '(不明な物件)'}</p>
        {result && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {result.selected_tags?.length ? (
              <span className="flex flex-wrap gap-1">
                {result.selected_tags.map((t) => (
                  <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-gray-400">(キーワード選択なし)</span>
            )}
            <span>滞在 {formatSeconds((result.dwell_ms ?? 0) / 1000)}</span>
            {result.zoom_count > 0 && <span>ズーム ×{result.zoom_count}</span>}
            {result.page_turn_count > 0 && <span>ページ送り ×{result.page_turn_count}</span>}
            {result.revisit_count > 0 && <span>再閲覧 ×{result.revisit_count}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function PassRow({ listing, result }: { listing: ListingWithThumb | undefined; result: SwipeResult }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/40 p-3">
      {listing?.thumbnailUrl && (
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 opacity-70">
          <Image src={listing.thumbnailUrl} alt="" fill sizes="40px" className="object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-700">{listing?.title ?? '(不明な物件)'}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
          <span>滞在 {formatSeconds((result.dwell_ms ?? 0) / 1000)}</span>
          {result.selected_tags?.length ? <span>気になった点: {result.selected_tags.join('、')}</span> : null}
        </div>
      </div>
    </div>
  )
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0秒'
  if (sec < 60) return `${Math.round(sec)}秒`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}分${s}秒`
}

function renderParams(params: Record<string, unknown>): string {
  const keys = ['reaction', 'tag_code', 'selected', 'dwell_ms', 'from_page', 'to_page', 'direction', 'zoom_level', 'zoom_x_pct', 'zoom_y_pct', 'page_index']
  const parts: string[] = []
  for (const k of keys) {
    if (params[k] !== undefined && params[k] !== null) parts.push(`${k}=${String(params[k])}`)
  }
  return parts.join(' ')
}

interface DeviceBadge {
  label: string
  icon: string
  count: number
  tooltip: string
}
function buildDeviceSummary(events: SwipeEvent[]): DeviceBadge[] {
  const starts = events.filter((e) => e.event_name === 'session_start')
  const grouped = new Map<string, { count: number; widths: number[] }>()
  for (const ev of starts) {
    const p = (ev.params ?? {}) as Record<string, unknown>
    const dt = (p.device_type as string) || 'unknown'
    const w = typeof p.viewport_width === 'number' ? (p.viewport_width as number) : null
    const g = grouped.get(dt) ?? { count: 0, widths: [] }
    g.count += 1
    if (w) g.widths.push(w)
    grouped.set(dt, g)
  }
  const labels: Record<string, { label: string; icon: string }> = {
    mobile: { label: 'スマホ', icon: 'smartphone' },
    tablet: { label: 'タブレット', icon: 'tablet_mac' },
    desktop: { label: 'PC', icon: 'computer' },
    unknown: { label: '不明', icon: 'devices_other' },
  }
  return Array.from(grouped.entries()).map(([dt, g]) => {
    const meta = labels[dt] ?? labels.unknown
    const tooltip = g.widths.length
      ? `${meta.label}: ${g.widths.join('px, ')}px`
      : meta.label
    return { label: meta.label, icon: meta.icon, count: g.count, tooltip }
  })
}

function buildNextHint(d: ProposalDashboardData): string[] {
  const { results, listings } = d
  const out: string[] = []

  const tagCount: Record<string, number> = {}
  for (const r of results.values()) {
    if (r.reaction !== 'like') continue
    for (const t of r.selected_tags ?? []) {
      tagCount[t] = (tagCount[t] ?? 0) + 1
    }
  }
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topTags.length) {
    out.push(`「${topTags.map(([t, n]) => `${t} ×${n}`).join('、')}」が良く選ばれています。次回はこの特徴を満たす物件を優先で。`)
  }

  const longPasses = Array.from(results.values()).filter(
    (r) => r.reaction === 'pass' && (r.dwell_ms ?? 0) > 15000,
  )
  if (longPasses.length) {
    const names = longPasses.map((r) => listings.get(r.listing_id)?.title).filter(Boolean).join('、')
    out.push(`${longPasses.length}件の「違うかな」物件で15秒以上滞在しています (${names})。惜しい物件だった可能性あり。`)
  }

  const noticedPasses = Array.from(results.values()).filter(
    (r) => r.reaction === 'pass' && (r.selected_tags?.length ?? 0) > 0,
  )
  if (noticedPasses.length) {
    out.push(
      `違うかな物件でも${noticedPasses.length}件でキーワードがタップされています。価格やエリア等、物件以外の条件が合わなかった可能性。`,
    )
  }

  const zoomy = Array.from(results.values()).filter((r) => (r.zoom_count ?? 0) >= 2)
  if (zoomy.length >= 2) {
    out.push(`${zoomy.length}件の物件でズームが多用されています。詳細(家賃・設備・間取り)が気になっている可能性。`)
  }

  if (out.length === 0) {
    out.push('反応パターンのヒントを生成するには情報が不足しています。もう少しデータが溜まってから再度ご確認ください。')
  }
  return out
}
