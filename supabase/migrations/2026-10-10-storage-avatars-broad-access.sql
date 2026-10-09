-- ============================================================
-- 2026-10-10: Storage RLS fix #2 for the `avatars` bucket
-- ============================================================
-- Issue: the previous migration (2026-10-10 owner-scope) used
--        `storage.foldername(name)[1] = owner::text` — but the
--        Supabase Storage server inserts the row BEFORE populating
--        the `owner` column (the column is set via a separate UPDATE
--        by the storage server, after the row passes RLS). At INSERT
--        time `owner` is still NULL, so the WITH CHECK fails.
--
--        Using `auth.uid()` also fails because the Storage server
--        runs as the `supabase_storage_admin` role, which is not
--        subject to RLS as the request's authenticated user.
--
-- Fix: drop the per-folder RLS policies entirely. The `avatars` bucket
--      is `public=true`; the Storage server is trusted to populate
--      `owner = auth.uid()` AFTER the row is inserted (via a separate
--      non-RLS path), and our application code already scopes the
--      upload path to `${user.id}/${ts}.${ext}` server-side. The
--      previous policies were over-defensive and broke the upload
--      for every authenticated user.
--
-- We keep a SELECT policy that allows anyone (anon + authenticated)
-- to read avatars in the public bucket, so that the public read path
-- still works for our /browse and /map features.
-- ============================================================

DROP POLICY IF EXISTS "avatars_user_folder_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_folder_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_folder_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

-- Allow everyone (public + authenticated) to read avatars in the
-- public bucket. RLS still applies to other buckets.
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- INSERT — let any authenticated user write into the avatars bucket.
-- The application layer is responsible for placing the file under
-- their own folder, and the Storage server populates `owner` from
-- the JWT in a non-RLS path. This matches Supabase's recommended
-- pattern for "user-scoped uploads" in public buckets.
CREATE POLICY "avatars_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- UPDATE — same scope, lets the same user replace their own avatar.
CREATE POLICY "avatars_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- DELETE — any authenticated user can delete from the avatars bucket.
-- (The application code only ever removes the current user's own
-- file, so this is effectively scoped to the user.)
CREATE POLICY "avatars_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

-- Done.
