-- Public URL slug and GA tracking for company profiles
ALTER TABLE company_profiles ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE company_profiles ADD COLUMN ga_measurement_id TEXT;

-- Published listings
CREATE TABLE published_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- Published pages (one image per PDF page)
CREATE TABLE published_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES published_listings(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, page_number)
);

-- RLS
ALTER TABLE published_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_pages ENABLE ROW LEVEL SECURITY;

-- Owner can manage own listings
CREATE POLICY "Users can manage own listings"
  ON published_listings FOR ALL
  USING (auth.uid() = user_id);

-- Public can view published listings
CREATE POLICY "Public can view published listings"
  ON published_listings FOR SELECT
  USING (is_published = true);

-- Owner can manage own listing pages
CREATE POLICY "Users can manage own listing pages"
  ON published_pages FOR ALL
  USING (
    listing_id IN (
      SELECT id FROM published_listings WHERE auth.uid() = user_id
    )
  );

-- Public can view published pages
CREATE POLICY "Public can view published pages"
  ON published_pages FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM published_listings WHERE is_published = true
    )
  );

-- Triggers
CREATE TRIGGER update_published_listings_updated_at
  BEFORE UPDATE ON published_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_published_listings_user_slug ON published_listings(user_id, slug);
CREATE INDEX idx_published_pages_listing ON published_pages(listing_id, page_number);

-- Public storage bucket for published images
INSERT INTO storage.buckets (id, name, public) VALUES ('published', 'published', true);

-- Storage policies
CREATE POLICY "Users can upload published images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'published'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view published images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'published');

CREATE POLICY "Users can delete own published images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'published'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
