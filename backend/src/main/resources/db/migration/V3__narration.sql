-- Phase 6: generated narrator voice. Additive only.

-- One entry per scene, [{ "url": ..., "durationSec": ... }], or NULL when the story uses the browser's voice.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS narration jsonb;

-- Cache of generated clips, keyed by sha256(model | voice | style | text), like the models table for GLBs.
CREATE TABLE IF NOT EXISTS narration_clips (
    hash          text PRIMARY KEY,
    url           text NOT NULL,
    duration_sec  double precision NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
