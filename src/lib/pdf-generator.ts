import { PDFDocument, rgb, degrees, PDFImage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { CompanyProfile, Block, TextBlock, ImageBlock } from '@/lib/database.types'
import type { MaskSettings, PageInfo } from '@/types/editor'

const FEE_LABELS: Record<string, string> = {
  fee_ratio_landlord: '貸主負担',
  fee_ratio_tenant: '借主負担',
  fee_distribution_motoduke: '元付配分',
  fee_distribution_kyakuzuke: '客付配分',
}

async function embedImage(pdfDoc: PDFDocument, imageUrl: string): Promise<PDFImage | null> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) return null
    const imageData = await response.arrayBuffer()
    const lowerUrl = imageUrl.toLowerCase()

    if (lowerUrl.includes('.png') || lowerUrl.includes('png')) {
      return await pdfDoc.embedPng(imageData)
    } else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('jpeg')) {
      return await pdfDoc.embedJpg(imageData)
    } else {
      try {
        return await pdfDoc.embedJpg(imageData)
      } catch {
        try {
          return await pdfDoc.embedPng(imageData)
        } catch {
          return null
        }
      }
    }
  } catch {
    return null
  }
}

export interface GeneratePdfParams {
  pages: PageInfo[]
  maskSettings: { [pageId: string]: MaskSettings }
  blocks: { [pageId: string]: Block[] }
  companyProfile: CompanyProfile | null
  pageDimensions: { [pageId: string]: { width: number; height: number } }
  pageScales: { [pageId: string]: number }
}

export async function generateModifiedPdf(params: GeneratePdfParams): Promise<Uint8Array> {
  const { pages, maskSettings, blocks, companyProfile, pageDimensions, pageScales } = params

  const fontUrl = '/fonts/NotoSansJP-Regular.ttf'
  const fontBoldUrl = '/fonts/NotoSansJP-Bold.ttf'

  const [fontResponse, fontBoldResponse] = await Promise.all([
    fetch(fontUrl),
    fetch(fontBoldUrl)
  ])

  if (!fontResponse.ok || !fontBoldResponse.ok) {
    throw new Error('フォントの読み込みに失敗しました')
  }

  const fontBytes = await fontResponse.arrayBuffer()
  const fontBoldBytes = await fontBoldResponse.arrayBuffer()

  const mergedPdf = await PDFDocument.create()
  mergedPdf.registerFontkit(fontkit)

  const japaneseFont = await mergedPdf.embedFont(fontBytes)
  const japaneseFontBold = await mergedPdf.embedFont(fontBoldBytes)

  const imageCache: { [url: string]: PDFImage } = {}

  if (companyProfile?.logo_url) {
    const logoImage = await embedImage(mergedPdf, companyProfile.logo_url)
    if (logoImage) imageCache[companyProfile.logo_url] = logoImage
  }
  if (companyProfile?.line_qr_url) {
    const qrImage = await embedImage(mergedPdf, companyProfile.line_qr_url)
    if (qrImage) imageCache[companyProfile.line_qr_url] = qrImage
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const mask = maskSettings[page.id]
    const pageBlocks = blocks[page.id] || []
    if (!mask) continue

    const sourcePdf = await PDFDocument.load(page.pdfData)
    const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [page.pageNumber - 1])
    mergedPdf.addPage(copiedPage)

    const pdfPage = mergedPdf.getPage(mergedPdf.getPageCount() - 1)
    const { width: rawWidth, height: rawHeight } = pdfPage.getSize()
    const rotation = pdfPage.getRotation().angle

    const isRotated = rotation === 90 || rotation === 270
    const displayWidth = isRotated ? rawHeight : rawWidth
    const displayHeight = isRotated ? rawWidth : rawHeight

    const dims = pageDimensions[page.id] || { width: displayWidth, height: displayHeight }
    const scaleRatio = displayWidth / dims.width

    // White-out (bottom)
    const bottomMaskHeight = mask.bottomHeight

    let maskX: number, maskY: number, maskW: number, maskH: number

    switch (rotation) {
      case 90:
        maskX = 0; maskY = 0; maskW = bottomMaskHeight; maskH = rawHeight
        break
      case 180:
        maskX = 0; maskY = rawHeight - bottomMaskHeight; maskW = rawWidth; maskH = bottomMaskHeight
        break
      case 270:
        maskX = rawWidth - bottomMaskHeight; maskY = 0; maskW = bottomMaskHeight; maskH = rawHeight
        break
      default:
        maskX = 0; maskY = 0; maskW = rawWidth; maskH = bottomMaskHeight
    }

    pdfPage.drawRectangle({ x: maskX, y: maskY, width: maskW, height: maskH, color: rgb(1, 1, 1) })

    // White-out (L-shape left)
    if (mask.enableLShape && mask.leftWidth > 0) {
      let leftX: number, leftY: number, leftW: number, leftH: number
      const leftMaskWidth = mask.leftWidth

      switch (rotation) {
        case 90:
          leftX = 0; leftY = 0; leftW = rawWidth - bottomMaskHeight; leftH = leftMaskWidth
          break
        case 180:
          leftX = rawWidth - leftMaskWidth; leftY = 0; leftW = leftMaskWidth; leftH = rawHeight - bottomMaskHeight
          break
        case 270:
          leftX = bottomMaskHeight; leftY = rawHeight - leftMaskWidth; leftW = rawWidth - bottomMaskHeight; leftH = leftMaskWidth
          break
        default:
          leftX = 0; leftY = bottomMaskHeight; leftW = leftMaskWidth; leftH = rawHeight - bottomMaskHeight
      }

      pdfPage.drawRectangle({ x: leftX, y: leftY, width: leftW, height: leftH, color: rgb(1, 1, 1) })
    }

    // Image blocks
    for (const block of pageBlocks) {
      if (block.type !== 'image' || !companyProfile) continue

      const imageBlock = block as ImageBlock
      const imageUrl = imageBlock.field === 'logo'
        ? companyProfile.logo_url
        : companyProfile.line_qr_url

      if (!imageUrl) continue
      const embeddedImage = imageCache[imageUrl]
      if (!embeddedImage) continue

      const drawWidth = imageBlock.width * scaleRatio
      const drawHeight = imageBlock.height * scaleRatio
      const blockX = imageBlock.x * scaleRatio
      const blockY = imageBlock.y * scaleRatio

      let pdfX: number, pdfY: number
      let imageRotation = 0

      switch (rotation) {
        case 90:
          pdfX = blockY; pdfY = rawHeight - blockX - drawWidth; imageRotation = -90
          break
        case 180:
          pdfX = displayWidth - blockX - drawWidth; pdfY = blockY; imageRotation = 180
          break
        case 270:
          pdfX = rawWidth - blockY - drawHeight; pdfY = blockX; imageRotation = 90
          break
        default:
          pdfX = blockX; pdfY = displayHeight - blockY - drawHeight; imageRotation = 0
      }

      if (imageRotation !== 0) {
        pdfPage.drawImage(embeddedImage, {
          x: pdfX, y: pdfY,
          width: imageRotation === 90 || imageRotation === -90 ? drawHeight : drawWidth,
          height: imageRotation === 90 || imageRotation === -90 ? drawWidth : drawHeight,
          rotate: degrees(imageRotation),
        })
      } else {
        pdfPage.drawImage(embeddedImage, { x: pdfX, y: pdfY, width: drawWidth, height: drawHeight })
      }
    }

    // Text blocks
    for (const block of pageBlocks) {
      if (block.type !== 'text' || !companyProfile) continue

      const textBlock = block as TextBlock

      let content: string
      if (textBlock.field.startsWith('fee_')) {
        const value = companyProfile[textBlock.field as keyof CompanyProfile] as number | null
        if (value === null || value === undefined) continue
        content = `${FEE_LABELS[textBlock.field] || textBlock.field}: ${value}%`
      } else {
        content = companyProfile[textBlock.field as keyof CompanyProfile] as string
        if (!content) continue
      }

      const font = textBlock.fontWeight === 'bold' ? japaneseFontBold : japaneseFont
      const fontSize = textBlock.fontSize * scaleRatio

      const textWidthPx = font.widthOfTextAtSize(content, fontSize)
      const blockWidthPdf = textBlock.width * scaleRatio

      let blockX = textBlock.x * scaleRatio
      if (textBlock.textAlign === 'center') {
        blockX += (blockWidthPdf - textWidthPx) / 2
      } else if (textBlock.textAlign === 'right') {
        blockX += blockWidthPdf - textWidthPx
      }
      const baselineY = (textBlock.y + textBlock.height - 2) * scaleRatio

      let pdfTextX: number, pdfTextY: number
      let textRotation = 0

      switch (rotation) {
        case 90:
          pdfTextX = baselineY; pdfTextY = rawHeight - blockX - textWidthPx; textRotation = -90
          break
        case 180:
          pdfTextX = displayWidth - blockX - textWidthPx; pdfTextY = baselineY; textRotation = 180
          break
        case 270:
          pdfTextX = rawWidth - baselineY; pdfTextY = blockX; textRotation = -90
          break
        default:
          pdfTextX = blockX; pdfTextY = displayHeight - baselineY; textRotation = 0
      }

      pdfPage.drawText(content, {
        x: pdfTextX, y: pdfTextY,
        size: fontSize, font,
        color: rgb(0, 0, 0),
        rotate: textRotation !== 0 ? degrees(textRotation) : undefined,
      })
    }
  }

  const pdfBytes = await mergedPdf.save()
  return new Uint8Array(pdfBytes)
}
