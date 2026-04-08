import { createClient } from '@/lib/supabase/server'
import { GaScript } from '@/components/public/ga-script'
import { notFound } from 'next/navigation'

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ userSlug: string }>
}) {
  const { userSlug } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('company_profiles')
    .select('company_name, ga_measurement_id')
    .eq('slug', userSlug)
    .single()

  if (!profile) notFound()

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">
            {profile.company_name}
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
      {profile.ga_measurement_id && (
        <GaScript measurementId={profile.ga_measurement_id} />
      )}
    </div>
  )
}
