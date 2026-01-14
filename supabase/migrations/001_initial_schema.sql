-- 会社情報テーブル
CREATE TABLE company_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  fax TEXT,
  email TEXT NOT NULL,
  contact_person TEXT,
  license_number TEXT NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 配置テンプレートテーブル
CREATE TABLE layout_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  blocks JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) 有効化
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_templates ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 自分のデータのみアクセス可能
CREATE POLICY "Users can view own company profiles"
  ON company_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own company profiles"
  ON company_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own company profiles"
  ON company_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own company profiles"
  ON company_profiles FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own layout templates"
  ON layout_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own layout templates"
  ON layout_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own layout templates"
  ON layout_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own layout templates"
  ON layout_templates FOR DELETE
  USING (auth.uid() = user_id);

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_company_profiles_updated_at
  BEFORE UPDATE ON company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_layout_templates_updated_at
  BEFORE UPDATE ON layout_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ロゴ画像用のStorageバケット作成（Supabase Dashboardで手動作成も可）
-- INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);
