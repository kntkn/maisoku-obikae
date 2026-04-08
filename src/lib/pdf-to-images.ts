export interface RenderedPage {
  pageNumber: number
  blob: Blob
  width: number
  height: number
}

export async function renderPdfToImages(
  pdfBytes: Uint8Array,
  scale: number = 2.0
): Promise<RenderedPage[]> {
  // Dynamic import to avoid SSR issues
  const pdfjs = await import('pdfjs-dist')

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const version = pdfjs.version
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
  }

  const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise
  const results: RenderedPage[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, canvas, viewport } as Parameters<typeof page.render>[0]).promise

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
        'image/png'
      )
    })

    results.push({
      pageNumber: i,
      blob,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
    })

    // Release canvas memory
    canvas.width = 0
    canvas.height = 0
  }

  pdf.destroy()
  return results
}
