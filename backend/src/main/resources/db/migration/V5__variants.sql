-- Phase 6: retry and tweak a finished story. Additive only.

-- The story this one was made from, and how: 'tweak' (plan edited: place, time, weather) or 'retry' (planned again).
ALTER TABLE stories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES stories (id);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS variant text;
