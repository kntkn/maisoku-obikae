import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ダッシュボード</h2>
        <p className="text-muted-foreground">
          マイソク帯替えツールへようこそ
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>帯替え編集を開始</CardTitle>
            <CardDescription>
              PDFをアップロードして帯替え作業を行います
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/editor">
              <Button className="w-full">編集を開始</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>会社情報設定</CardTitle>
            <CardDescription>
              帯に表示する会社情報を登録・編集します
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings">
              <Button variant="outline" className="w-full">設定を開く</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>使い方</CardTitle>
            <CardDescription>
              ツールの基本的な使い方
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. 会社情報を登録</p>
            <p>2. PDFをアップロード</p>
            <p>3. 白塗り範囲を調整</p>
            <p>4. 会社情報を配置して出力</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
