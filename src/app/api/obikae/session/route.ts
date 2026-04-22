import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface VacancyInput {
  reinsId: string
  propertyName?: string
  roomNumber?: string
  address?: string
  rent?: string | number
  managementCompany?: string
  platformId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const customerName: string = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
    const rawVacancies: VacancyInput[] = Array.isArray(body?.vacancies) ? body.vacancies : []

    if (!customerName) {
      return NextResponse.json({ error: 'customerName is required' }, { status: 400 })
    }

    const vacancies = rawVacancies
      .filter((v) => typeof v?.reinsId === 'string' && v.reinsId.trim().length > 0)
      .map((v) => ({
        reinsId: v.reinsId.trim(),
        propertyName: v.propertyName ?? null,
        roomNumber: v.roomNumber ?? null,
        address: v.address ?? null,
        rent: v.rent ?? null,
        managementCompany: v.managementCompany ?? null,
        platformId: v.platformId ?? null,
      }))

    if (vacancies.length === 0) {
      return NextResponse.json({ error: 'vacancies must include at least one reinsId' }, { status: 400 })
    }

    const reinsIds = Array.from(new Set(vacancies.map((v) => v.reinsId)))

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('obikae_sessions')
      .insert({
        user_id: user.id,
        customer_name: customerName,
        reins_ids: reinsIds,
        vacancies,
      })
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: `failed to create session: ${error?.message ?? 'unknown'}` },
        { status: 500 }
      )
    }

    const origin = new URL(request.url).origin
    const editorUrl = `${origin}/editor/quick?session=${data.id}`

    return NextResponse.json({ sessionId: data.id, editorUrl })
  } catch (err) {
    console.error('[obikae/session POST] error:', err)
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
}
