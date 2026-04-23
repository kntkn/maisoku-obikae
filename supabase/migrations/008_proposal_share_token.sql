-- Share token for team access
--   Generates a random token on proposal creation so the broker can paste a
--   single URL into Slack/LINE and let the whole team view the dashboard
--   without logging in. RLS is extended: SELECT on proposal_sets /
--   swipe_results / swipe_events is allowed when the incoming request carries
--   a request header with a matching token.
--
--   We use PostgreSQL's current_setting('request.header.<name>') pattern that
--   Supabase/PostgREST exposes as `request.headers`. Clients pass
--   `x-share-token: <token>` with their anon request.
--
--   Important: this grants READ-only visibility to anyone with the URL. The
--   broker controls whether the URL leaks. No write surface is added.

ALTER TABLE proposal_sets
  ADD COLUMN IF NOT EXISTS share_token TEXT;

-- Backfill with random tokens for existing rows
UPDATE proposal_sets
SET share_token = encode(gen_random_bytes(16), 'hex')
WHERE share_token IS NULL;

-- Keep new rows populated automatically
CREATE OR REPLACE FUNCTION proposal_sets_default_share_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.share_token IS NULL OR NEW.share_token = '' THEN
    NEW.share_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_sets_share_token ON proposal_sets;
CREATE TRIGGER trg_proposal_sets_share_token
  BEFORE INSERT ON proposal_sets
  FOR EACH ROW
  EXECUTE FUNCTION proposal_sets_default_share_token();

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_sets_share_token
  ON proposal_sets(share_token);

-- Helper: read the incoming x-share-token header
CREATE OR REPLACE FUNCTION current_share_token()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT current_setting('request.headers', true)::JSONB ->> 'x-share-token';
$$;

-- Extend SELECT policies: add token-based branch.
-- proposal_sets already has a permissive public SELECT policy, so no change
-- needed there.

-- swipe_results: permissive public SELECT already exists (migration 005).
-- No additional policy required.

-- swipe_events: add a token-based SELECT policy alongside the owner policy.
DROP POLICY IF EXISTS "Share-token can read swipe events" ON swipe_events;
CREATE POLICY "Share-token can read swipe events"
  ON swipe_events FOR SELECT
  USING (
    proposal_id IN (
      SELECT id FROM proposal_sets
      WHERE share_token IS NOT NULL
        AND share_token = current_share_token()
    )
  );
