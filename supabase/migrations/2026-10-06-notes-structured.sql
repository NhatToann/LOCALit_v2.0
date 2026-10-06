-- 2026-10-06-notes-structured.sql
-- Purpose: Add 2 columns to trips for structured NotesTab fields.
BEGIN;
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS transport TEXT,
  ADD COLUMN IF NOT EXISTS meetup_point TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON trips TO service_role;
COMMIT;
