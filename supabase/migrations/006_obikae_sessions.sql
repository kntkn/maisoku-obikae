-- Obikae sessions bridge external trigger (e.g. sales-ai-mockup)
-- to the quick editor flow at /editor/quick.
CREATE TABLE obikae_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  reins_ids TEXT[] NOT NULL,
  vacancies JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposal_id UUID REFERENCES proposal_sets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE obikae_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own obikae sessions"
  ON obikae_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_obikae_sessions_user ON obikae_sessions(user_id);
CREATE INDEX idx_obikae_sessions_created ON obikae_sessions(created_at DESC);
