'use client'

import { useState } from 'react'
import Image from 'next/image'

export interface RankingListing {
  id: string
  title: string
  thumbnailUrl: string
}

interface PredictedRankingProps {
  customerName: string
  items: RankingListing[]
  initialOrder: string[]
  initialComment: string
  alreadyCompleted: boolean
  onOrderChange: (newOrder: string[], changedId: string, newPosition: number) => void
  onCommentChange: (comment: string) => void
  onSubmit: () => void | Promise<void>
  onRestart: () => void
}

export function PredictedRanking({
  customerName,
  items,
  initialOrder,
  initialComment,
  alreadyCompleted,
  onOrderChange,
  onCommentChange,
  onSubmit,
  onRestart,
}: PredictedRankingProps) {
  const [order, setOrder] = useState<string[]>(initialOrder)
  const [comment, setComment] = useState(initialComment)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(alreadyCompleted)
  const [submitting, setSubmitting] = useState(false)

  const byId = new Map(items.map((l) => [l.id, l]))
  const hasAny = order.length > 0

  function move(id: string, dir: 'up' | 'dn') {
    const idx = order.indexOf(id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swap < 0 || swap >= order.length) return
    const next = order.slice()
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setOrder(next)
    onOrderChange(next, id, swap + 1)
  }

  function handleDragOver(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const from = order.indexOf(draggingId)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = order.slice()
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setOrder(next)
    onOrderChange(next, draggingId, to + 1)
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSubmit()
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="propose-body mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#f7f7f8] px-5 pb-10 pt-7 md:max-w-[640px] md:px-8 md:pt-10">
      {/* Thank-you */}
      <div className="text-center">
        <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '40px' }}>
          volunteer_activism
        </span>
        <h1 className="mb-1 mt-2 text-[22px] font-bold">
          ご確認いただき
          <br />
          ありがとうございました
        </h1>
        <p className="m-0 text-[13px] leading-relaxed text-gray-500">
          貴重なご意見は、次回のご提案に
          <br />
          とても参考になります。
        </p>
      </div>

      {/* Predicted ranking */}
      <section className="mt-6 flex flex-col gap-2.5">
        <header className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
          <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '18px' }}>
            format_list_numbered
          </span>
          <span>
            <b className="text-gray-900">{customerName}様</b>への予想ランキング
          </span>
        </header>
        <p className="mb-1 text-[12px] leading-relaxed text-gray-500">
          反応から予想したランキングです。
          <br />
          <b className="text-gray-900">違っていたら</b>ドラッグ or ↑↓で並び替えて教えてください。
        </p>

        {hasAny ? (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {order.map((id, idx) => {
              const l = byId.get(id)
              if (!l) return null
              const rank = idx + 1
              const badgeBg =
                rank === 1
                  ? 'bg-[#fff5d1] text-[#ad8400]'
                  : rank === 2
                  ? 'bg-[#eeeef2] text-[#62626d]'
                  : rank === 3
                  ? 'bg-[#f4e2d1] text-[#8a5028]'
                  : 'bg-gray-100 text-gray-500'
              return (
                <li
                  key={id}
                  data-id={id}
                  draggable={!submitted}
                  onDragStart={() => setDraggingId(id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    handleDragOver(id)
                  }}
                  className={[
                    'relative flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm',
                    draggingId === id ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl font-bold ${badgeBg}`}
                  >
                    {rank}
                  </div>
                  <div className="relative h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-[10px] bg-gray-200">
                    <Image
                      src={l.thumbnailUrl}
                      alt=""
                      fill
                      sizes="52px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[14px] font-semibold">{l.title}</p>
                  </div>
                  {!submitted && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(id, 'up')}
                        disabled={idx === 0}
                        aria-label="順位を上げる"
                        className="inline-flex h-[22px] w-7 items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
                          arrow_upward
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, 'dn')}
                        disabled={idx === order.length - 1}
                        aria-label="順位を下げる"
                        className="inline-flex h-[22px] w-7 items-center justify-center rounded border border-gray-200 text-gray-500 disabled:opacity-30"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
                          arrow_downward
                        </span>
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center text-[13px] text-gray-500 shadow-sm">
            気になる物件が選ばれませんでした。
          </div>
        )}

        {hasAny && !submitted && (
          <>
            <label
              htmlFor="ranking-comment"
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-gray-500"
            >
              <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '18px' }}>
                chat
              </span>
              1位の決め手 (任意・1行)
            </label>
            <input
              id="ranking-comment"
              type="text"
              value={comment}
              maxLength={60}
              placeholder="例: 駅近で決まり"
              onChange={(e) => {
                const v = e.target.value
                setComment(v)
                onCommentChange(v.trim())
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[#2b5de4] focus:ring-2 focus:ring-[#2b5de4]/30"
            />
          </>
        )}
      </section>

      {/* Submit / sent */}
      {!submitted && hasAny && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {submitting ? '送信中…' : 'これで確認完了'}
          <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
            check
          </span>
        </button>
      )}

      {submitted && (
        <div className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-4 py-3 text-center text-[13px] text-green-600">
          <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
            check_circle
          </span>
          担当者に送信しました。ありがとうございました。
        </div>
      )}

      {/* Restart (demo/preview only) */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-transparent px-5 py-3 text-[14px] text-gray-500"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
            replay
          </span>
          もう一度見る
        </button>
      </div>
    </div>
  )
}
