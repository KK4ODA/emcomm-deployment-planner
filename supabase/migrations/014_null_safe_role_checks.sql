-- 014_null_safe_role_checks.sql
-- Found while probing publish_plan: for a caller with no `users` row,
-- get_user_role() is NULL, so `has_role()` and `is_admin()` returned NULL
-- rather than false, and `deployment_visible()` returned NULL rather than
-- false. RLS treats NULL as deny, so policies were safe, but a PL/pgSQL
-- guard written as `IF NOT has_role(...) THEN RAISE` does not fire on NULL.
-- Every such user normally has a row (created on sign-up), so this was not
-- reachable through the app, but the helpers should never be three-valued.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(get_user_role(auth.uid()) = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION has_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(get_user_role(auth.uid()) = ANY (roles), false);
$$;

CREATE OR REPLACE FUNCTION deployment_visible(dep UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(is_admin() OR EXISTS (
    SELECT 1 FROM deployments d
    WHERE d.id = dep AND d.ares_group_id = ANY (get_user_ares_groups(auth.uid()))
  ), false);
$$;

CREATE OR REPLACE FUNCTION location_visible(loc UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(deployment_visible((SELECT deployment_id FROM deployment_locations WHERE id = loc)), false);
$$;

-- shares_group_with() is a bare EXISTS and already two-valued; unchanged.
