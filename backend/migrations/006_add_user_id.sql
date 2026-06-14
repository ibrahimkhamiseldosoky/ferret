ALTER TABLE repositories ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);
