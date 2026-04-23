'use client'

/**
 * Client-side analytics for the customer-facing swipe flow.
 *
 * Dual-writes events:
 *   1. GA4 via window.gtag (existing pipeline, aggregate trends)
 *   2. Supabase swipe_events table (per-customer precision, feeds agent dashboard)
 *
 * Supabase writes are fire-and-forget — failures never block UX.
 */

import { createClient } from '@/lib/supabase/client'

type EventParams = Record<string, unknown>

interface SendOptions {
  proposalId: string
  sessionId: string
}

let pending: Promise<unknown> | null = null

export function sendSwipeEvent(
  eventName: string,
  params: EventParams,
  opts: SendOptions,
): void {
  // GA4 first — synchronous, cheap.
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, {
      proposal_id: opts.proposalId,
      session_id: opts.sessionId,
      ...params,
    })
  }

  // Supabase fire-and-forget. Batch-friendly: each call inserts one row.
  // If the page unmounts before flush, the request is still sent by the
  // network layer — we intentionally do NOT await.
  try {
    const supabase = createClient()
    const listingId = (params.property_id as string | undefined) ?? null
    pending = Promise.resolve(
      supabase.from('swipe_events').insert({
        proposal_id: opts.proposalId,
        session_id: opts.sessionId,
        listing_id: listingId,
        event_name: eventName,
        params: params as never,
      }),
    ).then(
      () => undefined,
      () => undefined,
    )
  } catch {
    // Swallow — GA already fired.
  }
}

/** Wait for any pending event write. Useful before a navigation. */
export async function flushSwipeEvents(): Promise<void> {
  if (pending) await pending
}

/** Generate a short stable session id for this browser tab. */
export function makeSessionId(): string {
  return 'ses_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

/** Simple 32-bit hash for anonymous customer id (not cryptographic). */
export function hashId(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return 'c_' + (h >>> 0).toString(36)
}

// ---------------------------------------------------------------------------
// Final confirmation submit
// ---------------------------------------------------------------------------

export interface PerListingResult {
  listingId: string
  reaction: 'like' | 'pass'
  selectedTags: string[]
  dwellMs: number
  zoomCount: number
  pageTurnCount: number
  revisitCount: number
}

export interface SubmitConfirmationInput {
  proposalId: string
  results: PerListingResult[]
  finalRanking: string[]
  rankingComment: string
}

export async function submitConfirmation(input: SubmitConfirmationInput): Promise<void> {
  const supabase = createClient()

  // Upsert one swipe_results row per listing with the richer reaction data.
  // UNIQUE(proposal_id, listing_id) makes this idempotent across re-submits.
  const rows = input.results.map((r) => ({
    proposal_id: input.proposalId,
    listing_id: r.listingId,
    liked: r.reaction === 'like',
    viewed_seconds: Math.round(r.dwellMs / 1000),
    reaction: r.reaction,
    selected_tags: r.selectedTags,
    dwell_ms: r.dwellMs,
    zoom_count: r.zoomCount,
    page_turn_count: r.pageTurnCount,
    revisit_count: r.revisitCount,
  }))

  if (rows.length) {
    const { error } = await supabase
      .from('swipe_results')
      .upsert(rows, { onConflict: 'proposal_id,listing_id' })
    if (error) throw error
  }

  const { error: psErr } = await supabase
    .from('proposal_sets')
    .update({
      final_ranking: input.finalRanking,
      ranking_comment: input.rankingComment || null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', input.proposalId)

  if (psErr) throw psErr
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}
