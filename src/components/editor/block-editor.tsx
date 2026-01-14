'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { CompanyProfile, Block, TextBlock } from '@/lib/database.types'

interface BlockEditorProps {
  canvasWidth: number
  canvasHeight: number
  maskBottomHeight: number
  maskLeftWidth: number
  enableLShape: boolean
  companyProfile: CompanyProfile | null
  blocks: Block[]
  onBlocksChange: (blocks: Block[]) => void
  selectedBlockId: string | null
  onSelectBlock: (id: string | null) => void
}

const FIELD_LABELS: Record<TextBlock['field'], string> = {
  company_name: '会社名',
  address: '住所',
  phone: '電話番号',
  fax: 'FAX',
  email: 'メール',
  contact_person: '担当者',
  license_number: '免許番号',
}

export function BlockEditor({
  canvasWidth,
  canvasHeight,
  maskBottomHeight,
  maskLeftWidth,
  enableLShape,
  companyProfile,
  blocks,
  onBlocksChange,
  selectedBlockId,
  onSelectBlock,
}: BlockEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{
    blockId: string
    startX: number
    startY: number
    blockStartX: number
    blockStartY: number
  } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, block: Block) => {
      e.stopPropagation()
      onSelectBlock(block.id)
      setDragging({
        blockId: block.id,
        startX: e.clientX,
        startY: e.clientY,
        blockStartX: block.x,
        blockStartY: block.y,
      })
    },
    [onSelectBlock]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return

      const deltaX = e.clientX - dragging.startX
      const deltaY = e.clientY - dragging.startY

      onBlocksChange(
        blocks.map((block) =>
          block.id === dragging.blockId
            ? {
                ...block,
                x: Math.max(0, Math.min(canvasWidth - block.width, dragging.blockStartX + deltaX)),
                y: Math.max(0, Math.min(canvasHeight - block.height, dragging.blockStartY + deltaY)),
              }
            : block
        )
      )
    },
    [dragging, blocks, onBlocksChange, canvasWidth, canvasHeight]
  )

  const handleMouseUp = useCallback(() => {
    setDragging(null)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const getBlockContent = (block: Block): string => {
    if (block.type === 'image') return '[ロゴ]'
    if (!companyProfile) return FIELD_LABELS[block.field]

    const value = companyProfile[block.field as keyof CompanyProfile]
    return (value as string) || FIELD_LABELS[block.field]
  }

  // 白塗り領域の計算
  const maskArea = {
    x: enableLShape ? maskLeftWidth : 0,
    y: canvasHeight - maskBottomHeight,
    width: enableLShape ? canvasWidth - maskLeftWidth : canvasWidth,
    height: maskBottomHeight,
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onClick={() => onSelectBlock(null)}
    >
      {/* 白塗り領域の可視化（薄いグレー） */}
      <div
        className="absolute bg-white border-2 border-dashed border-gray-300"
        style={{
          left: maskArea.x,
          top: maskArea.y,
          width: maskArea.width,
          height: maskArea.height,
        }}
      />

      {/* L字の左側 */}
      {enableLShape && maskLeftWidth > 0 && (
        <div
          className="absolute bg-white border-2 border-dashed border-gray-300"
          style={{
            left: 0,
            top: 0,
            width: maskLeftWidth,
            height: canvasHeight - maskBottomHeight,
          }}
        />
      )}

      {/* ブロック */}
      {blocks.map((block) => (
        <div
          key={block.id}
          className={`absolute cursor-move select-none ${
            selectedBlockId === block.id
              ? 'ring-2 ring-blue-500 ring-offset-1'
              : 'hover:ring-2 hover:ring-gray-400'
          }`}
          style={{
            left: block.x,
            top: block.y,
            width: block.width,
            height: block.height,
            fontSize: block.type === 'text' ? block.fontSize : undefined,
            fontWeight: block.type === 'text' ? block.fontWeight : undefined,
            textAlign: block.type === 'text' ? block.textAlign : undefined,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #ccc',
            padding: '2px 4px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
          onMouseDown={(e) => handleMouseDown(e, block)}
        >
          {getBlockContent(block)}
        </div>
      ))}
    </div>
  )
}

// 初期ブロック生成（白塗り範囲内に適切なマージンで配置）
// 会社名は大きく、その他の情報は小さめに
export function createInitialBlocks(
  canvasWidth: number,
  canvasHeight: number,
  maskBottomHeight: number,
  maskLeftWidth: number,
  enableLShape: boolean
): Block[] {
  // マージン設定
  const marginTop = 8
  const marginBottom = 8
  const marginX = 10

  // 白塗り範囲の計算
  const maskStartX = enableLShape ? maskLeftWidth : 0
  const maskStartY = canvasHeight - maskBottomHeight
  const availableWidth = enableLShape ? canvasWidth - maskLeftWidth - (marginX * 2) : canvasWidth - (marginX * 2)
  const availableHeight = maskBottomHeight - marginTop - marginBottom

  // フォントサイズ設定（白塗り高さに応じてスケール）
  const baseScale = Math.min(1, maskBottomHeight / 100)
  const companyNameFontSize = Math.max(11, Math.round(16 * baseScale))
  const smallFontSize = Math.max(8, Math.round(10 * baseScale))

  // 行高さ（フォントサイズに基づく）
  const companyNameHeight = companyNameFontSize + 6
  const smallLineHeight = smallFontSize + 6

  // 2列レイアウト
  const columnWidth = availableWidth / 2
  const startX = maskStartX + marginX
  const startY = maskStartY + marginTop

  const blocks: Block[] = []
  const timestamp = Date.now()

  // 左列: 会社名（大きめ）、免許番号（小さめ）
  let leftY = startY

  blocks.push({
    id: `block-company_name-${timestamp}`,
    type: 'text',
    field: 'company_name',
    x: startX,
    y: leftY,
    width: columnWidth - 5,
    height: companyNameHeight,
    fontSize: companyNameFontSize,
    fontWeight: 'bold',
    textAlign: 'left',
  })
  leftY += companyNameHeight + 4

  blocks.push({
    id: `block-license_number-${timestamp + 1}`,
    type: 'text',
    field: 'license_number',
    x: startX,
    y: leftY,
    width: columnWidth - 5,
    height: smallLineHeight,
    fontSize: smallFontSize,
    fontWeight: 'normal',
    textAlign: 'left',
  })

  // 右列: 住所、電話、メール（全て小さめ）
  const rightX = startX + columnWidth
  let rightY = startY

  blocks.push({
    id: `block-address-${timestamp + 2}`,
    type: 'text',
    field: 'address',
    x: rightX,
    y: rightY,
    width: columnWidth - 5,
    height: smallLineHeight,
    fontSize: smallFontSize,
    fontWeight: 'normal',
    textAlign: 'left',
  })
  rightY += smallLineHeight + 2

  blocks.push({
    id: `block-phone-${timestamp + 3}`,
    type: 'text',
    field: 'phone',
    x: rightX,
    y: rightY,
    width: columnWidth - 5,
    height: smallLineHeight,
    fontSize: smallFontSize,
    fontWeight: 'normal',
    textAlign: 'left',
  })
  rightY += smallLineHeight + 2

  blocks.push({
    id: `block-email-${timestamp + 4}`,
    type: 'text',
    field: 'email',
    x: rightX,
    y: rightY,
    width: columnWidth - 5,
    height: smallLineHeight,
    fontSize: smallFontSize,
    fontWeight: 'normal',
    textAlign: 'left',
  })

  return blocks
}
