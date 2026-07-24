-- ============================================
-- GRACE HIERARCHICAL TAG SYSTEM
-- Migration 002: Hierarchical Content Tagging
-- ============================================

-- Tag Definitions: Master catalog of all tags with hierarchy levels
CREATE TABLE IF NOT EXISTS tag_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name VARCHAR(255) NOT NULL,
  tag_level INTEGER NOT NULL CHECK (tag_level IN (1, 2, 3, 4)),
  -- Level 1: Genre (Novel, Poetry, Journalism, etc.)
  -- Level 2: Task (Character Development, Plot, Structure, etc.)
  -- Level 3: Specificity (Character Names, Specific Elements)
  -- Level 4: Literary Device (Metaphor, Dialogue, Pacing, etc.)
  parent_tag_id UUID REFERENCES tag_definitions(id) ON DELETE CASCADE,
  tag_path TEXT NOT NULL, -- e.g., "Novel > Character Development > Marcus > Dialogue"
  description TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for global tags
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure unique tag paths per user (or global)
  UNIQUE(user_id, tag_path)
);

CREATE INDEX idx_tag_definitions_level ON tag_definitions(tag_level);
CREATE INDEX idx_tag_definitions_parent ON tag_definitions(parent_tag_id);
CREATE INDEX idx_tag_definitions_path ON tag_definitions(tag_path);
CREATE INDEX idx_tag_definitions_user ON tag_definitions(user_id);

-- Tag Hierarchy: Defines parent-child relationships
CREATE TABLE IF NOT EXISTS tag_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tag_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
  child_tag_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
  hierarchy_level INTEGER NOT NULL, -- Depth in hierarchy (1-4)
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate relationships
  UNIQUE(parent_tag_id, child_tag_id)
);

CREATE INDEX idx_tag_hierarchy_parent ON tag_hierarchy(parent_tag_id);
CREATE INDEX idx_tag_hierarchy_child ON tag_hierarchy(child_tag_id);
CREATE INDEX idx_tag_hierarchy_level ON tag_hierarchy(hierarchy_level);

-- Conversation Tags: Links conversations to tags (many-to-many)
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confidence_score DECIMAL(3,2) DEFAULT 0.5, -- LLM extraction confidence
  tagged_at TIMESTAMP DEFAULT NOW(),
  tagged_by VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manual', 'user'
  
  -- Prevent duplicate tag assignments
  UNIQUE(conversation_id, tag_id)
);

CREATE INDEX idx_conversation_tags_conv ON conversation_tags(conversation_id);
CREATE INDEX idx_conversation_tags_tag ON conversation_tags(tag_id);
CREATE INDEX idx_conversation_tags_user ON conversation_tags(user_id);
CREATE INDEX idx_conversation_tags_confidence ON conversation_tags(confidence_score DESC);

-- Add GIN index on conversations.metadata JSONB for tag queries
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_tags 
  ON conversations USING GIN ((metadata->'tags'));

-- Add index on conversations.metadata for general JSONB queries
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_gin 
  ON conversations USING GIN (metadata);

-- Add project_id to conversations if it doesn't exist (for tag filtering by project)
-- This should already exist, but adding check for safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE conversations ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_conversations_project ON conversations(project_id);
  END IF;
END $$;

-- Materialized view for frequently accessed tag combinations (performance optimization)
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_tag_summary AS
SELECT 
  c.id AS conversation_id,
  c.user_id,
  c.project_id,
  c.title,
  c.updated_at,
  array_agg(DISTINCT td.tag_path ORDER BY td.tag_path) AS tag_paths,
  array_agg(DISTINCT td.tag_level ORDER BY td.tag_level) AS tag_levels,
  COUNT(DISTINCT ct.tag_id) AS tag_count,
  MAX(ct.confidence_score) AS max_confidence
FROM conversations c
LEFT JOIN conversation_tags ct ON c.id = ct.conversation_id
LEFT JOIN tag_definitions td ON ct.tag_id = td.id
GROUP BY c.id, c.user_id, c.project_id, c.title, c.updated_at;

CREATE UNIQUE INDEX idx_conversation_tag_summary_conv ON conversation_tag_summary(conversation_id);
CREATE INDEX idx_conversation_tag_summary_user ON conversation_tag_summary(user_id);
CREATE INDEX idx_conversation_tag_summary_project ON conversation_tag_summary(project_id);
CREATE INDEX idx_conversation_tag_summary_tags ON conversation_tag_summary USING GIN(tag_paths);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_conversation_tag_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_tag_summary;
END;
$$ LANGUAGE plpgsql;

-- Insert default global tag definitions (Level 1: Genre)
INSERT INTO tag_definitions (tag_name, tag_level, parent_tag_id, tag_path, description, user_id)
VALUES
  ('Novel', 1, NULL, 'Novel', 'Long-form narrative fiction', NULL),
  ('Poetry', 1, NULL, 'Poetry', 'Verse and poetic forms', NULL),
  ('Journalism', 1, NULL, 'Journalism', 'News and journalistic writing', NULL),
  ('Short Story', 1, NULL, 'Short Story', 'Short-form narrative fiction', NULL),
  ('Essay', 1, NULL, 'Essay', 'Non-fiction prose', NULL),
  ('Screenplay', 1, NULL, 'Screenplay', 'Script writing for film/TV', NULL)
ON CONFLICT DO NOTHING;

-- Insert default Level 2 tags (Task)
INSERT INTO tag_definitions (tag_name, tag_level, parent_tag_id, tag_path, description, user_id)
SELECT 
  tasks.tag_name,
  2,
  parent.id,
  parent.tag_path || ' > ' || tasks.tag_name,
  tasks.description,
  NULL
FROM (
  VALUES
    ('Character Development', 'Developing characters and their arcs'),
    ('Plot', 'Story structure and plot development'),
    ('Structure', 'Narrative structure and organization'),
    ('Dialogue', 'Character dialogue and speech'),
    ('Description', 'Setting and scene description'),
    ('Pacing', 'Narrative pacing and rhythm'),
    ('Theme', 'Thematic elements and meaning'),
    ('Voice', 'Authorial voice and style')
) AS tasks(tag_name, description)
CROSS JOIN tag_definitions parent
WHERE parent.tag_level = 1
ON CONFLICT DO NOTHING;

-- Create tag hierarchy relationships
INSERT INTO tag_hierarchy (parent_tag_id, child_tag_id, hierarchy_level)
SELECT 
  parent.id,
  child.id,
  2
FROM tag_definitions parent
JOIN tag_definitions child ON child.parent_tag_id = parent.id
WHERE parent.tag_level = 1 AND child.tag_level = 2
ON CONFLICT DO NOTHING;

