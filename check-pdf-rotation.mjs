import { PDFDocument } from 'pdf-lib'
import { readFile } from 'fs/promises'

async function checkPdfRotation(filePath) {
  console.log(`\nChecking: ${filePath}`)
  try {
    const pdfBytes = await readFile(filePath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const pageCount = pdfDoc.getPageCount()

    console.log(`Total pages: ${pageCount}`)

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i)
      const { width, height } = page.getSize()
      const rotation = page.getRotation().angle
      console.log(`Page ${i + 1}: ${width}x${height}, rotation: ${rotation}`)
    }
  } catch (err) {
    console.error('Error:', err.message)
  }
}

// 出力されたPDFをチェック
const files = [
  process.env.HOME + '/Downloads/帯替え済み_2026-01-14 (2).pdf',
]

for (const file of files) {
  await checkPdfRotation(file)
}
