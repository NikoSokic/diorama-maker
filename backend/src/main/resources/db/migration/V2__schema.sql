-- Core schema: generated 3D models (cache), stories and their characters.

CREATE TABLE models (
    id              uuid PRIMARY KEY,
    -- sha256 of source + generation settings + normalized prompt (see ModelCacheKey)
    prompt_hash     text        NOT NULL UNIQUE,
    prompt          text        NOT NULL,
    source          text        NOT NULL,          -- mock | live
    tripo_task_id   text,
    glb_url         text        NOT NULL,
    thumbnail_url   text,
    rigged          boolean     NOT NULL DEFAULT false,
    rig_type        text,
    rig_task_id     text,
    rigged_glb_url  text,
    -- [{ "name": "walk", "preset": "preset:biped:walk", "url": "..." }]
    animations      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stories (
    id          uuid PRIMARY KEY,
    slug        text        NOT NULL UNIQUE,
    text        text        NOT NULL,
    lang        text        NOT NULL,
    plan        jsonb,
    status      text        NOT NULL,
    error       text,
    error_code  text,
    ip_hash     text        NOT NULL,
    is_public   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stories_ip_hash_created_idx ON stories (ip_hash, created_at);
CREATE INDEX stories_public_ready_idx ON stories (created_at DESC) WHERE is_public AND status = 'READY';

CREATE TABLE story_characters (
    id          uuid PRIMARY KEY,
    story_id    uuid        NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
    char_key    text        NOT NULL,
    model_id    uuid        REFERENCES models (id) ON DELETE SET NULL,
    status      text        NOT NULL,
    progress    integer     NOT NULL DEFAULT 0,
    error       text,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (story_id, char_key)
);

-- Tables are only used by the backend over JDBC. RLS without policies blocks Supabase's auto REST API.
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_characters ENABLE ROW LEVEL SECURITY;
