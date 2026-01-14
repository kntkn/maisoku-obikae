'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Block, TextBlock } from '@/lib/database.types'

interface BlockPropertiesProps {
  block: Block | null
  onUpdate: (block: Block) => void
  onDelete: (id: string) => void
}

export function BlockProperties({ block, onUpdate, onDelete }: BlockPropertiesProps) {
  if (!block) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ブロック設定</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ブロックを選択すると設定を編集できます
          </p>
        </CardContent>
      </Card>
    )
  }

  const handleChange = <K extends keyof Block>(key: K, value: Block[K]) => {
    onUpdate({ ...block, [key]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">ブロック設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 位置 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">X位置</Label>
            <Input
              type="number"
              value={block.x}
              onChange={(e) => handleChange('x', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Y位置</Label>
            <Input
              type="number"
              value={block.y}
              onChange={(e) => handleChange('y', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
        </div>

        {/* サイズ */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">幅</Label>
            <Input
              type="number"
              value={block.width}
              onChange={(e) => handleChange('width', Math.max(20, parseInt(e.target.value) || 20))}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">高さ</Label>
            <Input
              type="number"
              value={block.height}
              onChange={(e) => handleChange('height', Math.max(10, parseInt(e.target.value) || 10))}
              className="h-8"
            />
          </div>
        </div>

        {/* テキストブロックの場合のみ */}
        {block.type === 'text' && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">フォントサイズ</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange('fontSize' as keyof Block, Math.max(8, (block as TextBlock).fontSize - 1) as never)
                  }
                >
                  -
                </Button>
                <Input
                  type="number"
                  value={(block as TextBlock).fontSize}
                  onChange={(e) =>
                    handleChange('fontSize' as keyof Block, Math.max(8, parseInt(e.target.value) || 12) as never)
                  }
                  className="h-8 w-16 text-center"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleChange('fontSize' as keyof Block, ((block as TextBlock).fontSize + 1) as never)
                  }
                >
                  +
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">太字</Label>
              <div className="flex gap-2">
                <Button
                  variant={(block as TextBlock).fontWeight === 'normal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange('fontWeight' as keyof Block, 'normal' as never)}
                >
                  標準
                </Button>
                <Button
                  variant={(block as TextBlock).fontWeight === 'bold' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange('fontWeight' as keyof Block, 'bold' as never)}
                >
                  太字
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">配置</Label>
              <div className="flex gap-1">
                <Button
                  variant={(block as TextBlock).textAlign === 'left' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange('textAlign' as keyof Block, 'left' as never)}
                >
                  左
                </Button>
                <Button
                  variant={(block as TextBlock).textAlign === 'center' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange('textAlign' as keyof Block, 'center' as never)}
                >
                  中央
                </Button>
                <Button
                  variant={(block as TextBlock).textAlign === 'right' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChange('textAlign' as keyof Block, 'right' as never)}
                >
                  右
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="pt-2 border-t">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(block.id)}
          >
            ブロックを削除
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
