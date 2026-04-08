-- Proposal sets (groups of listings sent to a customer)
CREATE TABLE proposal_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  listing_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Swipe results (customer's like/pass per property)
CREATE TABLE swipe_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposal_sets(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES published_listings(id) ON DELETE CASCADE,
  liked BOOLEAN NOT NULL,
  viewed_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, listing_id)
);

-- RLS
ALTER TABLE proposal_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_results ENABLE ROW LEVEL SECURITY;

-- Owner can manage proposals
CREATE POLICY "Users can manage own proposals"
  ON proposal_sets FOR ALL
  USING (auth.uid() = user_id);

-- Public can view published proposals (for swipe UI)
CREATE POLICY "Public can view proposals"
  ON proposal_sets FOR SELECT
  USING (true);

-- Public can insert swipe results (anonymous users swiping)
CREATE POLICY "Public can insert swipe results"
  ON swipe_results FOR INSERT
  WITH CHECK (true);

-- Public can read swipe results (for review page)
CREATE POLICY "Public can view swipe results"
  ON swipe_results FOR SELECT
  USING (true);

-- Owner can manage swipe results
CREATE POLICY "Users can manage swipe results of own proposals"
  ON swipe_results FOR ALL
  USING (
    proposal_id IN (
      SELECT id FROM proposal_sets WHERE auth.uid() = user_id
    )
  );

-- Indexes
CREATE INDEX idx_proposal_sets_user ON proposal_sets(user_id);
CREATE INDEX idx_proposal_sets_slug ON proposal_sets(slug);
CREATE INDEX idx_swipe_results_proposal ON swipe_results(proposal_id);
