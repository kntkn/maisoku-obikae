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

// 初期ブロック生成
export function createInitialBlocks(
  canvasWidth: number,
  canvasHeight: number,
  maskBottomHeight: number,
  maskLeftWidth: number,
  enableLShape: boolean
): Block[] {
  const startY = canvasHeight - maskBottomHeight + 10
  const startX = enableLShape ? maskLeftWidth + 10 : 10
  const lineHeight = 24
  let currentY = startY

  const blocks: Block[] = []

  const addTextBlock = (field: TextBlock['field'], width: number) => {
    blocks.push({
      id: `block-${field}-${Date.now()}`,
      type: 'text',
      field,
      x: startX,
      y: currentY,
      width,
      height: 20,
      fontSize: 12,
      fontWeight: field === 'company_name' ? 'bold' : 'normal',
      textAlign: 'left',
    })
    currentY += lineHeight
  }

  addTextBlock('company_name', 200)
  addTextBlock('license_number', 250)
  addTextBlock('address', 300)
  addTextBlock('phone', 150)
  addTextBlock('email', 200)

  return blocks
}
