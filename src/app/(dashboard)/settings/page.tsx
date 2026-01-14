'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { CompanyProfile } from '@/lib/database.types'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<Partial<CompanyProfile>>({
    company_name: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    contact_person: '',
    license_number: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('company_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
        return
      }

      if (data) {
        setProfile(data)
        if (data.logo_url) {
          setLogoPreview(data.logo_url)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadLogo = async (userId: string): Promise<string | null> => {
    if (!logoFile) return profile.logo_url || null

    const fileExt = logoFile.name.split('.').pop()
    const fileName = `${userId}/logo.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, logoFile, { upsert: true })

    if (uploadError) {
      console.error('Logo upload error:', uploadError)
      return profile.logo_url || null
    }

    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName)

    return publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('ログインが必要です')
        return
      }

      const logoUrl = await uploadLogo(user.id)

      const profileData = {
        user_id: user.id,
        company_name: profile.company_name || '',
        address: profile.address || '',
        phone: profile.phone || '',
        fax: profile.fax || null,
        email: profile.email || '',
        contact_person: profile.contact_person || null,
        license_number: profile.license_number || '',
        logo_url: logoUrl,
      }

      const { data: existing } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      let error
      if (existing) {
        const result = await supabase
          .from('company_profiles')
          .update(profileData)
          .eq('user_id', user.id)
        error = result.error
      } else {
        const result = await supabase
          .from('company_profiles')
          .insert(profileData)
        error = result.error
      }

      if (error) {
        toast.error('保存に失敗しました')
        console.error('Save error:', error)
        return
      }

      toast.success('会社情報を保存しました')
    } catch (error) {
      console.error('Error:', error)
      toast.error('エラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">会社情報設定</h2>
        <p className="text-muted-foreground">
          マイソクの帯に表示する会社情報を登録します
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
            <CardDescription>
              必須項目は全て入力してください
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">会社名 *</Label>
              <Input
                id="company_name"
                value={profile.company_name || ''}
                onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                placeholder="株式会社○○不動産"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">住所 *</Label>
              <Input
                id="address"
                value={profile.address || ''}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="東京都○○区○○1-2-3"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">電話番号 *</Label>
                <Input
                  id="phone"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="03-1234-5678"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fax">FAX</Label>
                <Input
                  id="fax"
                  value={profile.fax || ''}
                  onChange={(e) => setProfile({ ...profile, fax: e.target.value })}
                  placeholder="03-1234-5679"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス *</Label>
              <Input
                id="email"
                type="email"
                value={profile.email || ''}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="info@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_person">担当者名</Label>
              <Input
                id="contact_person"
                value={profile.contact_person || ''}
                onChange={(e) => setProfile({ ...profile, contact_person: e.target.value })}
                placeholder="山田 太郎"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="license_number">国土交通大臣免許番号 *</Label>
              <Input
                id="license_number"
                value={profile.license_number || ''}
                onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                placeholder="国土交通大臣(1)第○○○○号"
                required
              />
            </div>

            <Separator className="my-4" />

            <div className="space-y-2">
              <Label htmlFor="logo">ロゴ画像</Label>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
              />
              {logoPreview && (
                <div className="mt-2">
                  <img
                    src={logoPreview}
                    alt="ロゴプレビュー"
                    className="max-h-24 object-contain border rounded p-2"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </Button>
        </div>
      </form>
    </div>
  )
}
