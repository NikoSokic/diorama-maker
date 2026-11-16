-- Phase 6: gallery thumbnails captured by the creator's player. Additive only.

ALTER TABLE stories ADD COLUMN IF NOT EXISTS thumbnail_url text;
-- sha256 of the single-use token that lets the creator's browser upload the thumbnail; cleared once used.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS upload_token_hash text;
