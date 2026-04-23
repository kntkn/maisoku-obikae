'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

/**
 * Common suggestion pool — tags we know already have a nice Material Symbols
 * icon wired on the swipe card. Adding a tag outside this list still works,
 * it just falls back to the generic `label` icon on the chip.
 */
const TAG_SUGGESTIONS: readonly string[] = [
  '駅近',
  '築浅',
  '南向き',
  '広め',
  '高層階',
  'リノベ',
  'デザイナーズ',
  '静かな立地',
  '新築',
  'コスパ',
  'セキュリティ充実',
  '閑静',
  'バルコニー広',
  'ペット可',
]

interface TagEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listingId: string
  listingTitle: string
  initialTags: string[]
  onSaved: (tags: string[]) => void
}

export function TagEditorDialog(props: TagEditorDialogProps) {
  // Remount the inner component whenever we swap listings so local state
  // resets cleanly without a setState-in-effect.
  const k = `${props.listingId}:${props.open ? 'open' : 'closed'}`
  return <TagEditorDialogInner key={k} {...props} />
}

function TagEditorDialogInner({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  initialTags,
  onSaved,
}: TagEditorDialogProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const toggle = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }
  const addFree = () => {
    const v = input.trim()
    if (!v) return
    if (v.length > 16) {
      toast.error('タグは16文字以内で')
      return
    }
    if (!tags.includes(v)) setTags([...tags, v])
    setInput('')
  }
  const remove = (t: string) => setTags((prev) => prev.filter((x) => x !== t))

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('published_listings')
      .update({ highlight_tags: tags })
      .eq('id', listingId)
    setSaving(false)
    if (error) {
      toast.error('保存に失敗しました')
      return
    }
    toast.success('タグを保存しました')
    onSaved(tags)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>キーワード編集</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {listingTitle} のスワイプカードに表示されるタグです。
            <br />
            お客様がタップして気になる物件の理由を伝えるのに使われます。
          </p>
        </DialogHeader>

        {/* Currently-selected tags */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">選択中のタグ</p>
          <div className="flex min-h-10 flex-wrap gap-1.5 rounded-lg border bg-gray-50 p-2">
            {tags.length === 0 ? (
              <span className="text-xs text-gray-400">(タグ未設定)</span>
            ) : (
              tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => remove(t)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  {t}
                  <span className="text-[14px] leading-none">×</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Suggested tags (toggle) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">候補から選ぶ</p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_SUGGESTIONS.map((t) => {
              const on = tags.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-blue-500 bg-blue-100 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* Free input */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">自由入力で追加</p>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addFree()
                }
              }}
              placeholder="例: 南向き、バルコニー広…"
              maxLength={16}
              className="h-9"
            />
            <Button type="button" variant="outline" size="sm" onClick={addFree} disabled={!input.trim()}>
              追加
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            候補にないタグは汎用アイコンで表示されます。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
