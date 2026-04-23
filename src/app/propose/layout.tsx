import { Noto_Sans_JP } from 'next/font/google'
import './propose.css'

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
})

export default function ProposeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={notoSansJp.className}>
      {/* Material Symbols icon font — loaded from Google Fonts CDN.
          eslint-disable-next-line reflects that we intentionally scope this to
          the /propose route via App Router nested layout (the lint rule is a
          stale Pages-Router heuristic that assumes page-level <link>s leak). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0,0&display=swap"
        rel="stylesheet"
      />
      {children}
    </div>
  )
}
