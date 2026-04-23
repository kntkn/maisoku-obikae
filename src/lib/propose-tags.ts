/**
 * Tag catalogue for the swipe proposal flow.
 *
 *  - UNIVERSAL_POS_TAGS: always shown on every card, no matter the listing.
 *  - per-listing tags come from `published_listings.highlight_tags`.
 *  - TAG_ICONS maps a label to its Material Symbols icon name; unknown
 *    labels fall back to the generic 'label' icon.
 */

export const UNIVERSAL_POS_TAGS: readonly string[] = [
  '駅近',
  '広い',
  '綺麗',
  '築浅',
  '南向き',
  'お得',
  '収納多い',
  'キッチン広い',
  '風呂トイレ別',
  'セキュリティ◎',
  '閑静',
  '日当たり◎',
  'デザイン性◎',
]

export const TAG_ICONS: Record<string, string> = {
  // universal positive
  '駅近': 'train',
  '広い': 'open_in_full',
  '綺麗': 'auto_awesome',
  '築浅': 'verified',
  '南向き': 'wb_sunny',
  'お得': 'savings',
  '収納多い': 'inventory_2',
  'キッチン広い': 'kitchen',
  '風呂トイレ別': 'bathtub',
  'セキュリティ◎': 'security',
  '閑静': 'volume_off',
  '日当たり◎': 'light_mode',
  'デザイン性◎': 'palette',
  // per-listing positive — common property traits
  '広め': 'open_in_full',
  '高層階': 'keyboard_double_arrow_up',
  'リノベ': 'auto_fix_high',
  'デザイナーズ': 'palette',
  '静かな立地': 'volume_off',
  '新築': 'verified',
  'コスパ': 'payments',
  'セキュリティ充実': 'security',
  'バルコニー広': 'deck',
  'ペット可': 'pets',
  '駐車場あり': 'local_parking',
  '宅配ボックス': 'inbox',
  'インターネット無料': 'wifi',
  'エアコン付': 'ac_unit',
  '眺望◎': 'landscape',
}

/** Build the unique chip list for a listing (universal + highlight_tags, dedupe). */
export function tagsForListing(highlightTags: readonly string[] | null | undefined) {
  const labels = [...UNIVERSAL_POS_TAGS, ...(highlightTags ?? [])]
  const seen = new Set<string>()
  const out: { label: string; icon: string }[] = []
  for (const l of labels) {
    if (seen.has(l)) continue
    seen.add(l)
    out.push({ label: l, icon: TAG_ICONS[l] ?? 'label' })
  }
  return out
}

/**
 * Format the card title as `{物件名} ({現在ページ}/{全体ページ})`.
 * Brokers often embed "(N/M)" in the stored title to track ordinals within
 * a proposal — we strip that so the display only shows the maisoku page
 * position, which is what the customer actually needs to know.
 */
export function formatCardTitle(rawTitle: string, pageIndex: number, totalPages: number): string {
  const cleaned = rawTitle.replace(/\s*[（(]\s*\d+\s*\/\s*\d+\s*[）)]\s*$/, '').trim()
  return `${cleaned} (${pageIndex + 1}/${Math.max(1, totalPages)})`
}

/**
 * Predicted-ranking score used to seed the S_END drag list.
 * Like strongly positive, explicit negative penalty, dwell/zoom/tags amplify.
 */
export function predictedScore(input: {
  reaction: 'like' | 'pass' | null
  dwellMs: number
  zoomCount: number
  pageTurnCount: number
  selectedTags: readonly string[]
}): number {
  return (
    (input.reaction === 'like' ? 10 : input.reaction === 'pass' ? -10 : 0) +
    (input.dwellMs / 1000) * 0.1 +
    input.zoomCount * 2 +
    input.pageTurnCount * 1 +
    input.selectedTags.length * 3
  )
}
