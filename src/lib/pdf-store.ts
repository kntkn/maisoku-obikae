/**
 * IndexedDB-backed scratch store for transferring large PDF blobs between
 * `/editor/quick` (writer) and `/editor` (reader) on the same origin.
 *
 * sessionStorage has a ~5-10MB browser quota which is easily exceeded when
 * 10 property PDFs are base64-encoded. IndexedDB scales to the browser's
 * larger per-origin quota (typically hundreds of MB) and stores binary
 * Uint8Array directly without base64 overhead.
 */

const DB_NAME = 'obikae-pdf-store'
const STORE_NAME = 'pdfs'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putPdfs(key: string, pdfs: Uint8Array[]): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(pdfs, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function getPdfs(key: string): Promise<Uint8Array[] | null> {
  const db = await openDb()
  try {
    return await new Promise<Uint8Array[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        const val = req.result
        if (!val) return resolve(null)
        if (Array.isArray(val) && val.every((v) => v instanceof Uint8Array)) {
          resolve(val as Uint8Array[])
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function clearPdfs(key: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
