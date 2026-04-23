-- Swipe feedback v2
--   - Customer taps keyword chips on each property card (stored per reaction)
--   - 2-way reaction (like / pass); 'hold' removed
--   - Final screen confirms a predicted ranking + optional 1-位 comment
--   - Granular event log for DB-side analytics (complements client-side GA)

-- 1. Per-listing tag pool for chip UI ----------------------------------------
ALTER TABLE published_listings
  ADD COLUMN IF NOT EXISTS highlight_tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. Proposal confirmation (final ranking + comment + completion timestamp) -
ALTER TABLE proposal_sets
  ADD COLUMN IF NOT EXISTS final_ranking UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS ranking_comment TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. Richer per-listing swipe result ----------------------------------------
ALTER TABLE swipe_results
  ADD COLUMN IF NOT EXISTS reaction TEXT CHECK (reaction IN ('like', 'pass')),
  ADD COLUMN IF NOT EXISTS selected_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS dwell_ms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoom_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_turn_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revisit_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill reaction from the legacy liked BOOLEAN so both columns agree.
UPDATE swipe_results
SET reaction = CASE WHEN liked THEN 'like' ELSE 'pass' END
WHERE reaction IS NULL;

-- 4. Granular event stream (GA-mirror for DB-side analytics) ----------------
CREATE TABLE IF NOT EXISTS swipe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposal_sets(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  listing_id UUID REFERENCES published_listings(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  params JSONB DEFAULT '{}'::JSONB,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swipe_events_proposal ON swipe_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_swipe_events_session  ON swipe_events(session_id);
CREATE INDEX IF NOT EXISTS idx_swipe_events_event    ON swipe_events(event_name);
CREATE INDEX IF NOT EXISTS idx_swipe_events_ts       ON swipe_events(ts DESC);

ALTER TABLE swipe_events ENABLE ROW LEVEL SECURITY;

-- Anonymous customer can insert events during a swipe session
CREATE POLICY "Public can insert swipe events"
  ON swipe_events FOR INSERT
  WITH CHECK (true);

-- Owner (proposal creator) can read events for their proposals
CREATE POLICY "Owner can read swipe events"
  ON swipe_events FOR SELECT
  USING (
    proposal_id IN (
      SELECT id FROM proposal_sets WHERE auth.uid() = user_id
    )
  );

-- 5. Keep updated_at in sync for swipe_results upserts ----------------------
CREATE OR REPLACE FUNCTION touch_swipe_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_swipe_results_touch ON swipe_results;
CREATE TRIGGER trg_swipe_results_touch
  BEFORE UPDATE ON swipe_results
  FOR EACH ROW
  EXECUTE FUNCTION touch_swipe_results_updated_at();
