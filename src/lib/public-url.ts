/**
 * Resolve the public-facing base URL for shareable links (/propose, /p).
 *
 * When running locally (`next dev`), `window.location.origin` is
 * `http://localhost:3000` — not safe to send to customers. Setting
 * `NEXT_PUBLIC_SITE_URL=https://fango-reco.vercel.app` in `.env.local`
 * forces URLs built in the editor to point to the production deployment
 * (same Supabase project → same data, so the shared link resolves there).
 */
export function getPublicBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (raw && raw.trim().length > 0) {
    return raw.trim().replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}
