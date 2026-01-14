import { pdfjs } from 'react-pdf'

// react-pdfのworker設定（クライアントサイドのみ）
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

export { pdfjs }
