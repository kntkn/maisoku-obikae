'use client'

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <h2 className="text-lg font-semibold text-red-600">エディターでエラーが発生しました</h2>
      <pre className="text-sm text-gray-600 bg-gray-100 p-4 rounded max-w-lg overflow-auto">
        {error.message}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700"
      >
        再試行
      </button>
    </div>
  )
}
