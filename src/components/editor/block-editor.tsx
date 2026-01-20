'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { CompanyProfile, Block, TextBlock, ImageBlock } from '@/lib/database.types'

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
  fee_ratio_landlord: '貸主負担',
  fee_ratio_tenant: '借主負担',
  fee_distribution_motoduke: '元付配分',
  fee_distribution_kyakuzuke: '客付配分',
}

const IMAGE_LABELS: Record<ImageBlock['field'], string> = {
  logo: 'ロゴ',
  line_qr: 'LINE QR',
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

  const getBlockContent = (block: Block): string | React.ReactNode => {
    if (block.type === 'image') {
      const imageUrl = block.field === 'logo'
        ? companyProfile?.logo_url
        : companyProfile?.line_qr_url
      return `[${IMAGE_LABELS[block.field]}]`
    }

    if (!companyProfile) return FIELD_LABELS[block.field]

    // 手数料フィールドの場合はラベル付きで表示
    if (block.field.startsWith('fee_')) {
      const value = companyProfile[block.field as keyof CompanyProfile] as number | null
      if (value === null || value === undefined) return `[${FIELD_LABELS[block.field]}]`
      return `${FIELD_LABELS[block.field]}: ${value}%`
    }

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
            backgroundColor: block.type === 'image' ? 'rgba(200, 200, 255, 0.3)' : 'rgba(255, 255, 255, 0.9)',
            border: block.type === 'image' ? '2px dashed #6366f1' : '1px solid #ccc',
            padding: '2px 4px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            display: 'flex',
            alignItems: 'center',
            justifyContent: block.type === 'image' ? 'center' : undefined,
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
// 3分割レイアウト: [ロゴ（左端）] [テキスト情報（中央）] [QR（右端）]
export function createInitialBlocks(
  canvasWidth: number,
  canvasHeight: number,
  maskBottomHeight: number,
  maskLeftWidth: number,
  enableLShape: boolean,
  companyProfile: CompanyProfile | null
): Block[] {
  // マージン設定
  const marginTop = 8
  const marginBottom = 8
  const marginX = 10
  const gapBetweenSections = 10

  // 白塗り範囲の計算
  const maskStartX = enableLShape ? maskLeftWidth : 0
  const maskStartY = canvasHeight - maskBottomHeight
  const totalAvailableWidth = (enableLShape ? canvasWidth - maskLeftWidth : canvasWidth) - (marginX * 2)
  const availableHeight = maskBottomHeight - marginTop - marginBottom

  // フォントサイズ設定（白塗り高さに応じてスケール）
  const baseScale = Math.min(1, maskBottomHeight / 100)
  const companyNameFontSize = Math.max(11, Math.round(16 * baseScale))
  const smallFontSize = Math.max(8, Math.round(10 * baseScale))

  // 行高さ（フォントサイズに基づく）
  const companyNameHeight = companyNameFontSize + 6
  const smallLineHeight = smallFontSize + 6

  const blocks: Block[] = []
  const timestamp = Date.now()

  // 画像サイズの計算
  const hasLogo = !!companyProfile?.logo_url
  const hasQr = !!companyProfile?.line_qr_url
  const imageSize = Math.min(availableHeight, availableHeight * 0.9) // 高さに合わせた正方形

  // ロゴブロック（左端）
  let logoWidth = 0
  if (hasLogo) {
    logoWidth = imageSize
    blocks.push({
      id: `block-logo-${timestamp}`,
      type: 'image',
      field: 'logo',
      x: maskStartX + marginX,
      y: maskStartY + marginTop + (availableHeight - imageSize) / 2,
      width: imageSize,
      height: imageSize,
    })
  }

  // QRブロック（右端）
  let qrWidth = 0
  if (hasQr) {
    qrWidth = imageSize
    blocks.push({
      id: `block-line_qr-${timestamp + 1}`,
      type: 'image',
      field: 'line_qr',
      x: maskStartX + marginX + totalAvailableWidth - imageSize,
      y: maskStartY + marginTop + (availableHeight - imageSize) / 2,
      width: imageSize,
      height: imageSize,
    })
  }

  // テキスト領域の計算
  const textStartX = maskStartX + marginX + (hasLogo ? logoWidth + gapBetweenSections : 0)
  const textAreaWidth = totalAvailableWidth
    - (hasLogo ? logoWidth + gapBetweenSections : 0)
    - (hasQr ? qrWidth + gapBetweenSections : 0)

  // テキストブロック用の2列レイアウト
  const columnWidth = textAreaWidth / 2
  const startY = maskStartY + marginTop

  // 左列: 会社名（大きめ）、免許番号、手数料情報
  let leftY = startY

  blocks.push({
    id: `block-company_name-${timestamp + 2}`,
    type: 'text',
    field: 'company_name',
    x: textStartX,
    y: leftY,
    width: columnWidth - 5,
    height: companyNameHeight,
    fontSize: companyNameFontSize,
    fontWeight: 'bold',
    textAlign: 'left',
  })
  leftY += companyNameHeight + 2

  blocks.push({
    id: `block-license_number-${timestamp + 3}`,
    type: 'text',
    field: 'license_number',
    x: textStartX,
    y: leftY,
    width: columnWidth - 5,
    height: smallLineHeight,
    fontSize: smallFontSize,
    fontWeight: 'normal',
    textAlign: 'left',
  })
  leftY += smallLineHeight + 2

  // 手数料情報（設定されている場合のみ）
  if (companyProfile?.fee_ratio_landlord !== null && companyProfile?.fee_ratio_landlord !== undefined) {
    blocks.push({
      id: `block-fee_ratio_landlord-${timestamp + 4}`,
      type: 'text',
      field: 'fee_ratio_landlord',
      x: textStartX,
      y: leftY,
      width: (columnWidth - 5) / 2 - 2,
      height: smallLineHeight,
      fontSize: smallFontSize,
      fontWeight: 'normal',
      textAlign: 'left',
    })

    blocks.push({
      id: `block-fee_ratio_tenant-${timestamp + 5}`,
      type: 'text',
      field: 'fee_ratio_tenant',
      x: textStartX + (columnWidth - 5) / 2,
      y: leftY,
      width: (columnWidth - 5) / 2 - 2,
      height: smallLineHeight,
      fontSize: smallFontSize,
      fontWeight: 'normal',
      textAlign: 'left',
    })
    leftY += smallLineHeight + 2
  }

  if (companyProfile?.fee_distribution_motoduke !== null && companyProfile?.fee_distribution_motoduke !== undefined) {
    blocks.push({
      id: `block-fee_distribution_motoduke-${timestamp + 6}`,
      type: 'text',
      field: 'fee_distribution_motoduke',
      x: textStartX,
      y: leftY,
      width: (columnWidth - 5) / 2 - 2,
      height: smallLineHeight,
      fontSize: smallFontSize,
      fontWeight: 'normal',
      textAlign: 'left',
    })

    blocks.push({
      id: `block-fee_distribution_kyakuzuke-${timestamp + 7}`,
      type: 'text',
      field: 'fee_distribution_kyakuzuke',
      x: textStartX + (columnWidth - 5) / 2,
      y: leftY,
      width: (columnWidth - 5) / 2 - 2,
      height: smallLineHeight,
      fontSize: smallFontSize,
      fontWeight: 'normal',
      textAlign: 'left',
    })
  }

  // 右列: 住所、電話、メール（全て小さめ）
  const rightX = textStartX + columnWidth
  let rightY = startY

  blocks.push({
    id: `block-address-${timestamp + 8}`,
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
    id: `block-phone-${timestamp + 9}`,
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
    id: `block-email-${timestamp + 10}`,
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
