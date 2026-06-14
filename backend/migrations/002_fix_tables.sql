-- Add missing columns if table already exists
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS file_count INTEGER DEFAULT 0;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Create nodes table if not exists
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'file',
  data JSONB DEFAULT '{}',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create edges table if not exists
CREATE TABLE IF NOT EXISTS edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

CREATE INDEX IF NOT EXISTS idx_nodes_repository_id ON nodes(repository_id);
CREATE INDEX IF NOT EXISTS idx_edges_repository_id ON edges(repository_id);
