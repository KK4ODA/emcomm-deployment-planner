-- 007: Fix notifications_* RLS policies that referenced auth.users
--
-- The previous policies evaluated user_email against
-- (SELECT email FROM auth.users WHERE id = auth.uid()), but the
-- 'authenticated' role lacks SELECT permission on auth.users (it's a
-- protected schema). PostgreSQL raised error 42501 ("permission denied
-- for table users") and PostgREST returned 403 — so SELECT/UPDATE/DELETE
-- on the notifications table appeared to fail with a permissions error
-- even though the rows existed.
--
-- Fix: pull the email from the JWT directly via auth.jwt(), which is the
-- standard Supabase pattern and doesn't touch auth.users at all.

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (
    user_email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (
    user_email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated USING (
    user_email = (auth.jwt() ->> 'email')
  );
