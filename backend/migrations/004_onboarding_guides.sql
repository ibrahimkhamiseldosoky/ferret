-- Create onboarding_guides table
CREATE TABLE IF NOT EXISTS onboarding_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  overview TEXT NOT NULL,
  reading_order JSONB NOT NULL DEFAULT '[]',
  core_concepts JSONB NOT NULL DEFAULT '[]',
  estimated_hours INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_repository_id ON onboarding_guides(repository_id);
