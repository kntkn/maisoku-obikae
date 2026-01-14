'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { MaskSettings } from './pdf-viewer'

interface MaskControlsProps {
  settings: MaskSettings
  onChange: (settings: MaskSettings) => void
  step?: number
}

export function MaskControls({ settings, onChange, step = 10 }: MaskControlsProps) {
  const updateBottomHeight = (delta: number) => {
    const newHeight = Math.max(0, settings.bottomHeight + delta)
    onChange({ ...settings, bottomHeight: newHeight })
  }

  const updateLeftWidth = (delta: number) => {
    const newWidth = Math.max(0, settings.leftWidth + delta)
    onChange({ ...settings, leftWidth: newWidth })
  }

  const toggleLShape = () => {
    onChange({ ...settings, enableLShape: !settings.enableLShape })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">白塗り範囲調整</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 下部の高さ調整 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">下部の高さ (px)</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => updateBottomHeight(-step)}
              disabled={settings.bottomHeight <= 0}
            >
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              value={settings.bottomHeight}
              onChange={(e) =>
                onChange({
                  ...settings,
                  bottomHeight: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              className="w-24 text-center"
              min={0}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => updateBottomHeight(step)}
            >
              <ChevronUpIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* L字切り替え */}
        <div className="flex items-center gap-3">
          <Button
            variant={settings.enableLShape ? 'default' : 'outline'}
            onClick={toggleLShape}
            className="w-full"
          >
            {settings.enableLShape ? 'L字: ON' : 'L字: OFF'}
          </Button>
        </div>

        {/* 左側の幅調整（L字有効時のみ） */}
        {settings.enableLShape && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">左側の幅 (px)</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => updateLeftWidth(-step)}
                disabled={settings.leftWidth <= 0}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={settings.leftWidth}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    leftWidth: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                className="w-24 text-center"
                min={0}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => updateLeftWidth(step)}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}
