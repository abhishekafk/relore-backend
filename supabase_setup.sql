-- ============================================================
-- re:lore Supabase SQL Setup
-- Run this in Supabase Dashboard → SQL Editor (in order)
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. users table (mirrors Supabase Auth users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY,
  email           text UNIQUE NOT NULL,
  display_name    text,
  avatar_url      text,
  created_at      timestamptz DEFAULT now(),
  last_seen_at    timestamptz,
  streak_count    integer DEFAULT 0,
  total_reels_saved integer DEFAULT 0
);

-- ============================================================
-- 3. reels table (core data model)
-- ============================================================
CREATE TABLE IF NOT EXISTS reels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  instagram_url   text NOT NULL,
  title           text,
  thumbnail_url   text,
  transcript      text,
  summary         text[],
  category        text,
  subcategory     text,
  tags            text[],
  locations       text[],
  skill_name      text,
  skill_schema    jsonb,
  skill_data      jsonb,
  embedding       vector(768),
  status          text DEFAULT 'processing',
  created_at      timestamptz DEFAULT now(),
  language        text
);

-- pgvector IVFFlat index for cosine similarity search
-- (ivfflat is best for ~100k-1M vectors; use hnsw for larger datasets)
CREATE INDEX IF NOT EXISTS reels_embedding_idx
  ON reels USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for fast user+status queries (home feed, processing banner)
CREATE INDEX IF NOT EXISTS reels_user_status_idx
  ON reels (user_id, status, created_at DESC);

-- ============================================================
-- 4. categories table (dynamically updated by backend)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  reel_count           integer DEFAULT 0,
  cover_thumbnail_url  text,
  UNIQUE (user_id, name)
);

-- ============================================================
-- 5. user_clusters table (AI-generated semantic clusters)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_clusters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  label         text,
  reel_ids      uuid[],
  generated_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 6. chat_messages table (for Phase 7 AI Chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('user', 'assistant')),
  content      text NOT NULL,
  cited_reels  uuid[],
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- 7. Row Level Security (RLS)
-- ============================================================
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clusters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "users: own row" ON users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "reels: own rows" ON reels
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "categories: own rows" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "clusters: own rows" ON user_clusters
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "chat: own rows" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 8. Semantic search function (used by POST /search)
-- ============================================================
CREATE OR REPLACE FUNCTION search_reels(
  query_embedding vector(768),
  match_user_id   uuid,
  match_limit     integer DEFAULT 10,
  match_threshold float DEFAULT 0.3,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  title           text,
  thumbnail_url   text,
  category        text,
  subcategory     text,
  tags            text[],
  summary         text[],
  transcript      text,
  skill_name      text,
  skill_data      jsonb,
  status          text,
  created_at      timestamptz,
  similarity      float
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id,
    r.title,
    r.thumbnail_url,
    r.category,
    r.subcategory,
    r.tags,
    r.summary,
    r.transcript,
    r.skill_name,
    r.skill_data,
    r.status,
    r.created_at,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM reels r
  WHERE
    r.user_id = match_user_id
    AND r.status = 'ready'
    AND r.embedding IS NOT NULL
    AND 1 - (r.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR r.category = filter_category)
  ORDER BY similarity DESC
  LIMIT match_limit;
$$;
