-- =================================================================
-- 2026-09-27: Drop orphaned tables and views
-- =================================================================
-- Drops 4 public-schema objects that no app code reads:
--   * call_logs           (chat-v2 WebRTC layer never wired)
--   * call_signals        (same)
--   * email_verifications (replaced by /api/auth/signup direct insert)
--   * safe_reviews        (view created for PII redaction, never queried)
--
-- Data to delete:
--   4 rows in call_logs
--   8 rows in call_signals
--   0 rows in email_verifications
--
-- Why this is safe:
--   - No app code references any of these (grep over app/ + components/ + scripts/ returns zero hits except the migrations themselves).
--   - Production runtime logs (last 24h) show zero queries against any of these tables.
--   - on_auth_user_created trigger is preserved (verified by scripts/drop-orphan-tables.mjs before drop).
--   - All public functions (handle_new_user, handle_updated_at, haversine_distance, derive_connection_lifecycle, trips_set_share_token) are preserved.
--   - Idempotent (DROP IF EXISTS, DELETE … has no rows to remove).
--
-- Companion script: scripts/drop-orphan-tables.mjs executes the same plan with
-- pre-flight trigger check and post-condition verification.
-- =================================================================

-- 1) Wipe data first so CASCADE has nothing else to delete.
DELETE FROM public.call_logs;        -- 4 rows
DELETE FROM public.call_signals;     -- 8 rows
DELETE FROM public.email_verifications; -- 0 rows (left for completeness)

-- 2) Drop in dependency order.
DROP VIEW  IF EXISTS public.safe_reviews;
DROP TABLE IF EXISTS public.call_logs           CASCADE;
DROP TABLE IF EXISTS public.call_signals        CASCADE;
DROP TABLE IF EXISTS public.email_verifications CASCADE;
