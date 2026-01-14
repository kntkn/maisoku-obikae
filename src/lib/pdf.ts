import { pdfjs } from 'react-pdf'

// react-pdfのworker設定
// CDNから読み込む（react-pdfが推奨する方法）
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export { pdfjs }

/**
 * PDFを読み込んでページ数を取得
 */
export async function loadPdf(data: ArrayBuffer) {
  return pdfjs.getDocument({ data }).promise
}
