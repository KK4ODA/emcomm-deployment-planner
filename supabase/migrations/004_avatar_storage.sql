-- 004: Profile avatars
-- Adds profile_image_url to users + 'avatars' Storage bucket with per-user RLS.
-- File path layout: avatars/<user_id>/avatar.<ext>

-- ============================================================
-- 1. Column on users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- ============================================================
-- 2. Public Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,                                                              -- public read via /storage/v1/object/public/...
  2 * 1024 * 1024,                                                   -- 2 MB cap (we resize client-side anyway)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 3. RLS on storage.objects for the avatars bucket
-- The first path segment must equal the auth.uid() of the writer.
-- ============================================================

-- Anyone (anonymous or authenticated) can read avatar objects.
-- The bucket is public so this is mostly belt-and-suspenders.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Only the authenticated user can write to their own folder.
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
