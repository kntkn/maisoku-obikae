import * as pdfjsLib from 'pdfjs-dist'

// PDF.js workerの設定（アプリケーション全体で1回だけ実行される）
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
}

export { pdfjsLib }

/**
 * PDFを読み込んでページ数を取得
 */
export async function loadPdf(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data }).promise
}

/**
 * PDFページをcanvasにレンダリング
 */
export async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({
    canvas,
    viewport,
  }).promise

  return { width: viewport.width, height: viewport.height }
}
