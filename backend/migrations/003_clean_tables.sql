-- Drop dependent tables first (in correct order), then repositories
DROP TABLE IF EXISTS edges CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;
DROP TABLE IF EXISTS architecture_edges CASCADE;
DROP TABLE IF EXISTS architecture_nodes CASCADE;
DROP TABLE IF EXISTS knowledge_edges CASCADE;
DROP TABLE IF EXISTS knowledge_nodes CASCADE;
DROP TABLE IF EXISTS dependency_items CASCADE;
DROP TABLE IF EXISTS health_issues CASCADE;
DROP TABLE IF EXISTS health_recommendations CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS repositories CASCADE;

-- Recreate with clean schema
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  language TEXT,
  file_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE nodes (
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

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_repository_id ON nodes(repository_id);
CREATE INDEX IF NOT EXISTS idx_edges_repository_id ON edges(repository_id);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
