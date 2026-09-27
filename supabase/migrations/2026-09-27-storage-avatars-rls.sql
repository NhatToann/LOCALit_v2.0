-- ============================================================
-- 2026-09-27: Storage RLS for the `avatars` bucket
-- ============================================================
-- Issue: avatar upload from /buddy/profile (and /tourist/profile) returned
--        `new row violates row-level security policy`. Root cause: the
--        `avatars` bucket is public for reads but has NO INSERT/UPDATE/DELETE
--        policy for `authenticated` users — only `service_role` could write.
--
-- Fix: add per-user folder policies. The buddy profile page already uploads
-- to `${user.id}/${ts}.${ext}`, and the tourist profile page (new in this
-- session) will use the same scheme. We scope writes to the user's own folder
-- by reading the first path segment via `storage.foldername(name)`.
--
-- Idempotent: DROP IF EXISTS + CREATE POLICY.
-- ============================================================

-- INSERT — a user may upload into their own folder
DROP POLICY IF EXISTS "avatars_user_folder_insert" ON storage.objects;
CREATE POLICY "avatars_user_folder_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE — same scope (lets the same user replace their own avatar file)
DROP POLICY IF EXISTS "avatars_user_folder_update" ON storage.objects;
CREATE POLICY "avatars_user_folder_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE — a user may delete only their own files
DROP POLICY IF EXISTS "avatars_user_folder_delete" ON storage.objects;
CREATE POLICY "avatars_user_folder_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public READ already works (bucket is public + storage has default anon read
-- for public buckets), so no new SELECT policy is needed.

-- Done.
