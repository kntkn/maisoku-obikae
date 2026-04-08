-- Per-listing GA measurement ID
ALTER TABLE published_listings ADD COLUMN ga_measurement_id TEXT;

-- Make listing slug globally unique (not just per-user)
ALTER TABLE published_listings DROP CONSTRAINT IF EXISTS published_listings_user_id_slug_key;
ALTER TABLE published_listings ADD CONSTRAINT published_listings_slug_key UNIQUE (slug);
