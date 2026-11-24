-- Security fix: V3 created narration_clips without RLS, so Supabase's auto-generated REST API let anyone
-- with the project URL and the public anon key read, change and delete it (Supabase advisor: rls_disabled_in_public).
-- Same approach as V2: RLS on, no policies. The backend connects as the table owner, so it is not affected.
ALTER TABLE narration_clips ENABLE ROW LEVEL SECURITY;

-- Flyway's own history table also lives in public and was never covered.
ALTER TABLE IF EXISTS flyway_schema_history ENABLE ROW LEVEL SECURITY;
