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
  'お得',
  '広い',
  '綺麗',
]

export const TAG_ICONS: Record<string, string> = {
  // universal positive
  '駅近': 'train',
  'お得': 'savings',
  '広い': 'open_in_full',
  '綺麗': 'auto_awesome',
  // per-listing positive — common property traits
  '築浅': 'verified',
  '南向き': 'wb_sunny',
  '広め': 'open_in_full',
  '高層階': 'keyboard_double_arrow_up',
  'リノベ': 'auto_fix_high',
  'デザイナーズ': 'palette',
  '静かな立地': 'volume_off',
  '新築': 'verified',
  'コスパ': 'payments',
  'セキュリティ充実': 'security',
  '閑静': 'nights_stay',
  'バルコニー広': 'deck',
  'ペット可': 'pets',
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
