-- =================================================================
-- Phase 1 (voice call) follow-up: allow message_type='call_event'
-- so voice-call lifecycle rows from /api/webrtc/call-client can be
-- inserted into public.messages.
--
-- Pre-2026-09-28, the CHECK constraint only allowed:
--   'text', 'image', 'file', 'location', 'system'
-- See: supabase/migrations/2026-09-27-chat-v2.sql
--
-- Migration is idempotent: DROP + ADD so re-running is safe.
-- =================================================================

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK ((message_type = ANY (ARRAY[
    'text'::text,
    'image'::text,
    'file'::text,
    'location'::text,
    'system'::text,
    'call_event'::text
  ])));
