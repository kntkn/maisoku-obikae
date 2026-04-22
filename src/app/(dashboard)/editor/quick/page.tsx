'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'
import { base64ToUint8, putPdfs } from '@/lib/pdf-store'

async function imageB64ToPdfBytes(jpegOrPngB64: string): Promise<Uint8Array> {
  const imgBytes = base64ToUint8(jpegOrPngB64)
  const pdfDoc = await PDFDocument.create()
  // Try jpg first, fall back to png
  let image
  try {
    image = await pdfDoc.embedJpg(imgBytes)
  } catch {
    image = await pdfDoc.embedPng(imgBytes)
  }
  const pg = pdfDoc.addPage([image.width, image.height])
  pg.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return pdfDoc.save()
}

interface VacancyFromMockup {
  reinsId: string
  maisokuUrl?: string | null
  propertyName?: string
  roomNumber?: string
  address?: string
  rent?: string | number | null
  managementCompany?: string
  platformId?: string
}

interface InitPayload {
  customerName: string
  parentOrigin: string
  vacancies: VacancyFromMockup[]
}

function decodeFragment(hash: string): InitPayload | null {
  if (!hash) return null
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(h)
  // URLSearchParams.get() already percent-decodes the value, so this is the
  // raw JSON string the mockup encoded with encodeURIComponent.
  const data = params.get('data')
  if (!data) return null
  try {
    return JSON.parse(data) as InitPayload
  } catch (e) {
    console.error('[editor/quick] fragment decode failed:', e)
    return null
  }
}

type Phase = 'bootstrapping' | 'fetching_pdfs' | 'preparing' | 'error'

export default function EditorQuickPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const startedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('bootstrapping')
  const [detail, setDetail] = useState('セッションを準備中...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const run = async () => {
      try {
        let effectiveSessionId: string | null = sessionId
        let customerName = ''
        let vacancies: VacancyFromMockup[] = []
        let parentOrigin = ''

        // Primary path: fragment-encoded init data from the mockup.
        const initFromFragment =
          typeof window !== 'undefined' ? decodeFragment(window.location.hash) : null

        if (initFromFragment) {
          customerName = initFromFragment.customerName
          vacancies = initFromFragment.vacancies ?? []
          parentOrigin = initFromFragment.parentOrigin ?? ''
        }

        if (!effectiveSessionId) {
          if (!customerName || vacancies.length === 0) {
            // Legacy fallback: support ?customer=&reins= query if fragment missing.
            const q = new URL(window.location.href)
            const customerQ = q.searchParams.get('customer')
            const reinsQ = q.searchParams.get('reins')
            const originQ = q.searchParams.get('parentOrigin')
            if (!customerQ || !reinsQ) {
              throw new Error('セッション情報がありません')
            }
            customerName = customerQ
            parentOrigin = originQ ?? parentOrigin
            vacancies = reinsQ
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((reinsId) => ({ reinsId }))
          }

          setPhase('bootstrapping')
          setDetail('セッションを作成中...')
          const createRes = await fetch('/api/obikae/session', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName,
              vacancies: vacancies.map((v) => ({
                reinsId: v.reinsId,
                propertyName: v.propertyName,
                roomNumber: v.roomNumber,
                address: v.address,
                rent: v.rent,
                managementCompany: v.managementCompany,
                platformId: v.platformId,
              })),
            }),
          })
          if (!createRes.ok) {
            const body = await createRes.json().catch(() => ({}))
            if (createRes.status === 401) {
              throw new Error(
                'ログインが必要です。このウィンドウでログイン後、もう一度お試しください。'
              )
            }
            throw new Error(body?.error ?? `セッション作成失敗 (${createRes.status})`)
          }
          const createData = (await createRes.json()) as { sessionId: string }
          effectiveSessionId = createData.sessionId
        } else {
          setPhase('bootstrapping')
          setDetail('セッション情報を取得中...')
          const sessionRes = await fetch(`/api/obikae/session/${effectiveSessionId}`, {
            credentials: 'include',
            cache: 'no-store',
          })
          if (!sessionRes.ok) {
            const body = await sessionRes.json().catch(() => ({}))
            throw new Error(body?.error ?? `セッション取得失敗 (${sessionRes.status})`)
          }
          const session = (await sessionRes.json()) as {
            id: string
            customer_name: string
            reins_ids: string[]
            vacancies: VacancyFromMockup[]
          }
          customerName = session.customer_name
          vacancies =
            session.vacancies && session.vacancies.length > 0
              ? session.vacancies
              : session.reins_ids.map((reinsId) => ({ reinsId }))
        }

        if (vacancies.length === 0) {
          throw new Error('空室物件がありません')
        }

        // ----- PDF acquisition -----------------------------------------------
        setPhase('fetching_pdfs')
        setDetail(`図面を取得中... (0/${vacancies.length})`)

        const pdfBytesList: Uint8Array[] = []
        const fallbackReinsIds: string[] = []

        // First pass: try the pre-secured maisokuUrl via server proxy.
        let completed = 0
        for (const v of vacancies) {
          if (!v.maisokuUrl) {
            fallbackReinsIds.push(v.reinsId)
            completed++
            setDetail(`図面を取得中... (${completed}/${vacancies.length})`)
            continue
          }
          try {
            const proxyRes = await fetch('/api/obikae/fetch-pdf', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: v.maisokuUrl }),
            })
            if (!proxyRes.ok) throw new Error(`proxy ${proxyRes.status}`)
            const proxyJson = (await proxyRes.json()) as {
              ok: boolean
              source: 'pdf' | 'screenshot'
              data: string
            }
            if (!proxyJson.ok || !proxyJson.data) throw new Error('empty proxy response')
            const bytes =
              proxyJson.source === 'screenshot'
                ? await imageB64ToPdfBytes(proxyJson.data)
                : base64ToUint8(proxyJson.data)
            pdfBytesList.push(bytes)
          } catch (err) {
            console.warn(
              `[editor/quick] maisokuUrl proxy failed for ${v.reinsId}, falling back to REINS`,
              err
            )
            fallbackReinsIds.push(v.reinsId)
          }
          completed++
          setDetail(`図面を取得中... (${completed}/${vacancies.length})`)
        }

        // Fallback pass: for any vacancy without a usable URL, hit REINS.
        if (fallbackReinsIds.length > 0) {
          setDetail(`REINS から再取得中... (${fallbackReinsIds.length}件)`)
          const res = await fetch('/api/reins/fetch-maisoku', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reinsIds: fallbackReinsIds }),
          })
          if (!res.ok) {
            throw new Error(`REINS 取得失敗 (${res.status})`)
          }
          const data = await res.json()
          for (const result of data.results ?? []) {
            if (result.status !== 'success' || !result.pdfs?.length) continue
            for (const b64 of result.pdfs) {
              if (result.source === 'screenshot') {
                pdfBytesList.push(await imageB64ToPdfBytes(b64))
              } else {
                pdfBytesList.push(base64ToUint8(b64))
              }
            }
          }
        }

        setPhase('preparing')
        setDetail('エディタへ移動中...')

        if (pdfBytesList.length === 0) {
          throw new Error('図面を取得できませんでした')
        }

        // IndexedDB has a much larger quota than sessionStorage (which caps at
        // ~5-10MB and overflows when several 1-2MB PDFs are base64-encoded).
        await putPdfs('reins-pdfs', pdfBytesList)

        const resolvedParentOrigin = (() => {
          if (parentOrigin) return parentOrigin
          if (typeof document !== 'undefined' && document.referrer) {
            try {
              return new URL(document.referrer).origin
            } catch {
              /* ignore */
            }
          }
          if (window.opener) {
            try {
              // opener.location.origin would throw cross-origin; we can't read it safely,
              // so fall back to '*'. postMessage will use '*' as target.
            } catch {
              /* ignore */
            }
          }
          return '*'
        })()

        sessionStorage.setItem(
          'obikae-embed-context',
          JSON.stringify({
            sessionId: effectiveSessionId,
            customerName,
            parentOrigin: resolvedParentOrigin,
          })
        )

        router.replace('/editor?source=reins&embed=1')
      } catch (e) {
        console.error('[editor/quick] error:', e)
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    }

    void run()
  }, [router, sessionId])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md w-full rounded-xl border bg-white p-8 text-center shadow-sm">
        {phase !== 'error' ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <h1 className="text-lg font-semibold text-gray-900">帯替え準備中</h1>
            <p className="mt-2 text-sm text-gray-600">{detail}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 text-3xl">⚠️</div>
            <h1 className="text-lg font-semibold text-gray-900">読み込みに失敗しました</h1>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <p className="mt-4 text-xs text-gray-400">
              ウィンドウを閉じてもう一度お試しください
            </p>
          </>
        )}
      </div>
    </div>
  )
}
