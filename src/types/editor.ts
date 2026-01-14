// エディター関連の型定義
// SSRでも安全にimport可能

export interface MaskSettings {
  bottomHeight: number
  leftWidth: number
  enableLShape: boolean
}

export interface PageInfo {
  id: string
  fileId: string
  fileIndex: number
  pageNumber: number
  fileName: string
  pdfData: Uint8Array  // ArrayBufferではなくUint8Arrayを使用（detached対策）
  status: 'pending' | 'editing' | 'done'
  canvasDimensions?: { width: number; height: number }
}

export interface PageMaskSettings {
  [pageId: string]: MaskSettings
}
