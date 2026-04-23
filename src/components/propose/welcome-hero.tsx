'use client'

/**
 * S0 — cinematic 5-image slideshow + welcome copy + start button.
 * Pure presentation; parent owns the start action.
 */

interface WelcomeHeroProps {
  customerName: string
  listingCount: number
  onStart: () => void
}

export function WelcomeHero({ customerName, listingCount, onStart }: WelcomeHeroProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#f7f7f8] md:flex-row md:items-center md:justify-center md:gap-10 md:px-10 md:py-10">
      {/* Hero slideshow */}
      <div
        aria-hidden
        className="relative w-full overflow-hidden bg-[#1a1a1f] md:w-[42%] md:max-w-[480px] md:flex-shrink-0 md:rounded-3xl md:shadow-2xl"
        style={{ aspectRatio: '9 / 11' }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`welcome-slide welcome-slide-${i}`}
            style={{ backgroundImage: `url(/welcome/0${i}.jpg)` }}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent via-60% to-[#f7f7f8] md:to-transparent" />
        <div className="absolute left-5 top-4 flex items-center gap-1.5 text-white drop-shadow">
          <span className="material-symbols-rounded" style={{ fontSize: '24px' }}>
            apartment
          </span>
          <p className="m-0 text-[12px] font-bold tracking-[0.22em]">FANGO</p>
        </div>
      </div>

      {/* Copy + CTA */}
      <div className="flex flex-1 flex-col gap-3.5 px-6 pb-7 pt-4 text-center md:max-w-[420px] md:flex-none md:px-0 md:pb-0 md:pt-0 md:text-left">
        <h1 className="m-0 text-2xl font-bold tracking-tight md:text-4xl">
          ようこそ、{customerName}様
        </h1>
        <p className="m-0 text-base leading-relaxed text-gray-500 md:text-lg">
          今日は <b className="text-gray-900">{listingCount}件</b> の物件を<br className="md:hidden" />
          ご用意しました
        </p>
        <ul className="m-0 flex list-none flex-col gap-3 rounded-2xl bg-white p-4 text-sm text-gray-600 shadow-sm md:p-5 md:text-[15px]">
          <li className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '20px' }}>
              swipe
            </span>
            <span className="md:hidden">左右スワイプ、または下のボタンで</span>
            <span className="hidden md:inline">
              ←/→ キーまたはボタンで物件を切り替え
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '20px' }}>
              touch_app
            </span>
            <span className="md:hidden">気軽に反応してください</span>
            <span className="hidden md:inline">
              K/↑ で気になる、J/↓ で違うかな
            </span>
          </li>
          <li className="hidden items-center gap-2.5 md:flex">
            <span className="material-symbols-rounded text-[#2b5de4]" style={{ fontSize: '20px' }}>
              zoom_in
            </span>
            画像をクリック or Z キーで拡大表示
          </li>
        </ul>

        <button
          type="button"
          onClick={onStart}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-4 text-base font-semibold text-white shadow-sm transition-transform active:translate-y-[1px] md:mt-4 md:self-start md:px-8 md:py-4 md:text-lg"
        >
          はじめる
          <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  )
}
