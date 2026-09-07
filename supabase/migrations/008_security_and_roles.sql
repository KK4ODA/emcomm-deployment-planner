-- 008: Security and roles (Phase 0 of docs/IMPLEMENTATION_ROADMAP.md)
--
-- Fixes shipped defects:
--   * read isolation: 8 tables were readable by any authenticated user
--   * event log: any authenticated user could write tasks through events
--   * self-service group membership (and self-service role escalation)
--   * call sign not unique / not validated
-- Adds:
--   * `planner` role (coordinators who are not admins)
--   * `memberships` table as the source of truth for group membership;
--     `users.ares_group_ids` becomes a trigger-maintained, read-only mirror
--   * `deployment_templates.ares_group_id` so templates are group-scoped
--   * fixed search_path and EXECUTE grants on SECURITY DEFINER functions
--
-- Additive and idempotent where practical. Existing data: 1 group, 1 user.

-- ============================================================
-- 1. Roles
-- ============================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_app_role_check;
ALTER TABLE users ADD CONSTRAINT users_app_role_check
  CHECK (app_role IN ('admin', 'planner', 'operator', 'viewer', 'pending'));

-- ============================================================
-- 2. Call sign: normalised, unique, format-checked
-- ============================================================
UPDATE users SET call_sign = NULLIF(upper(btrim(call_sign)), '') WHERE call_sign IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_call_sign_unique
  ON users (upper(call_sign)) WHERE call_sign IS NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_call_sign_format;
ALTER TABLE users ADD CONSTRAINT users_call_sign_format
  CHECK (call_sign IS NULL OR call_sign ~ '^[A-Z]{1,2}[0-9][A-Z]{1,3}$');

-- ============================================================
-- 3. Memberships (replaces the self-writable users.ares_group_ids)
-- ============================================================
CREATE TABLE IF NOT EXISTS memberships (
  ares_group_id UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  -- Reserved for per-organisation roles; unused while app_role is global.
  role          TEXT CHECK (role IN ('admin', 'planner', 'operator', 'viewer')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ,
  approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (ares_group_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_active_idx ON memberships (user_id) WHERE status = 'active';

-- Existing array memberships become active rows
INSERT INTO memberships (ares_group_id, user_id, status, approved_at)
SELECT g.id, u.id, 'active', now()
FROM users u
CROSS JOIN LATERAL unnest(COALESCE(u.ares_group_ids, '{}')) AS gid
JOIN ares_groups g ON g.id::text = gid
ON CONFLICT (ares_group_id, user_id) DO UPDATE SET status = 'active', approved_at = COALESCE(memberships.approved_at, now());

-- Group admins listed on the group are members too
INSERT INTO memberships (ares_group_id, user_id, status, approved_at)
SELECT g.id, uid, 'active', now()
FROM ares_groups g
CROSS JOIN LATERAL unnest(COALESCE(g.admin_user_ids, '{}')) AS uid
JOIN users u ON u.id = uid
ON CONFLICT (ares_group_id, user_id) DO UPDATE SET status = 'active', approved_at = COALESCE(memberships.approved_at, now());

-- Mirror active memberships into users.ares_group_ids (read path for clients)
CREATE OR REPLACE FUNCTION sync_user_group_mirror(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('emcomm.mirror', 'on', true);
  UPDATE users
     SET ares_group_ids = COALESCE(
           (SELECT array_agg(ares_group_id::text ORDER BY ares_group_id)
              FROM memberships WHERE user_id = p_user AND status = 'active'),
           '{}')
   WHERE id = p_user;
  PERFORM set_config('emcomm.mirror', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION memberships_mirror_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sync_user_group_mirror(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS memberships_mirror ON memberships;
CREATE TRIGGER memberships_mirror
  AFTER INSERT OR UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION memberships_mirror_trigger();

-- Protect columns clients must not set themselves:
--   * ares_group_ids is only written by the mirror
--   * app_role can only be changed by an admin (closes self-escalation)
CREATE OR REPLACE FUNCTION users_protect_columns()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF current_setting('emcomm.mirror', true) IS DISTINCT FROM 'on' THEN
    NEW.ares_group_ids := OLD.ares_group_ids;
  END IF;
  -- caller IS NULL means service role / migrations / triggers
  IF caller IS NOT NULL AND (SELECT app_role FROM users WHERE id = caller) IS DISTINCT FROM 'admin' THEN
    NEW.app_role := OLD.app_role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect ON users;
CREATE TRIGGER users_protect
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_protect_columns();

-- Resync every user once
SELECT sync_user_group_mirror(id) FROM users;

-- Tell admins when someone asks to join
CREATE OR REPLACE FUNCTION notify_admins_membership_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  who   TEXT;
  gname TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(call_sign, ''), NULLIF(full_name, ''), email) INTO who FROM users WHERE id = NEW.user_id;
  SELECT name INTO gname FROM ares_groups WHERE id = NEW.ares_group_id;
  INSERT INTO notifications (user_email, type, title, message)
  SELECT email, 'info', 'Membership request', COALESCE(who, 'A member') || ' asked to join ' || COALESCE(gname, 'a group')
  FROM users WHERE app_role = 'admin' AND email IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_notify_admins ON memberships;
CREATE TRIGGER memberships_notify_admins
  AFTER INSERT ON memberships
  FOR EACH ROW EXECUTE FUNCTION notify_admins_membership_request();

-- ============================================================
-- 4. Templates belong to a group
-- ============================================================
ALTER TABLE deployment_templates ADD COLUMN IF NOT EXISTS ares_group_id TEXT;

-- ============================================================
-- 5. RLS helper functions (SECURITY DEFINER so policies never recurse)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT app_role FROM users WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION get_user_ares_groups(uid UUID)
RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(ares_group_id::text), '{}')
  FROM memberships WHERE user_id = uid AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = 'admin';
$$;

CREATE OR REPLACE FUNCTION has_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT get_user_role(auth.uid()) = ANY (roles);
$$;

CREATE OR REPLACE FUNCTION deployment_visible(dep UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM deployments d
    WHERE d.id = dep AND d.ares_group_id = ANY (get_user_ares_groups(auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION location_visible(loc UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT deployment_visible((SELECT deployment_id FROM deployment_locations WHERE id = loc));
$$;

CREATE OR REPLACE FUNCTION shares_group_with(other UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships a
    JOIN memberships b ON b.ares_group_id = a.ares_group_id
    WHERE a.user_id = auth.uid() AND a.status = 'active'
      AND b.user_id = other AND b.status = 'active'
  );
$$;

-- ============================================================
-- 6. Policies
-- ============================================================
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- users: admins see all; otherwise yourself and people who share a group with you
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (is_admin() OR id = auth.uid() OR shares_group_with(id));
DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());

-- memberships
DROP POLICY IF EXISTS "memberships_select" ON memberships;
CREATE POLICY "memberships_select" ON memberships FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid() OR shares_group_with(user_id));
DROP POLICY IF EXISTS "memberships_insert" ON memberships;
CREATE POLICY "memberships_insert" ON memberships FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (user_id = auth.uid() AND status = 'pending' AND approved_at IS NULL));
DROP POLICY IF EXISTS "memberships_update" ON memberships;
CREATE POLICY "memberships_update" ON memberships FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "memberships_delete" ON memberships;
CREATE POLICY "memberships_delete" ON memberships FOR DELETE TO authenticated
  USING (is_admin() OR (user_id = auth.uid() AND status = 'pending'));

-- deployments
DROP POLICY IF EXISTS "deployments_select" ON deployments;
CREATE POLICY "deployments_select" ON deployments FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "deployments_insert" ON deployments;
CREATE POLICY "deployments_insert" ON deployments FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "deployments_update" ON deployments;
CREATE POLICY "deployments_update" ON deployments FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(id))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "deployments_delete" ON deployments;
CREATE POLICY "deployments_delete" ON deployments FOR DELETE TO authenticated
  USING (is_admin());

-- deployment_locations (sites)
DROP POLICY IF EXISTS "locations_select" ON deployment_locations;
CREATE POLICY "locations_select" ON deployment_locations FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "locations_insert" ON deployment_locations;
CREATE POLICY "locations_insert" ON deployment_locations FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "locations_update" ON deployment_locations;
CREATE POLICY "locations_update" ON deployment_locations FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "locations_delete" ON deployment_locations;
CREATE POLICY "locations_delete" ON deployment_locations FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- categories
DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "categories_insert" ON categories;
CREATE POLICY "categories_insert" ON categories FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "categories_update" ON categories;
CREATE POLICY "categories_update" ON categories FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_delete" ON categories FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- deployment_items (field operators may edit and assign)
DROP POLICY IF EXISTS "items_select" ON deployment_items;
CREATE POLICY "items_select" ON deployment_items FOR SELECT TO authenticated
  USING (location_visible(deployment_location_id));
DROP POLICY IF EXISTS "items_insert" ON deployment_items;
CREATE POLICY "items_insert" ON deployment_items FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "items_update" ON deployment_items;
CREATE POLICY "items_update" ON deployment_items FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id))
  WITH CHECK (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "items_delete" ON deployment_items;
CREATE POLICY "items_delete" ON deployment_items FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND location_visible(deployment_location_id));

-- tasks (materialised by the event trigger; direct writes by planners/operators)
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (location_visible(deployment_location_id));
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id))
  WITH CHECK (has_role('admin', 'planner', 'operator') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "tasks_delete" ON tasks;
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND location_visible(deployment_location_id));

-- deployment_templates (group-scoped)
DROP POLICY IF EXISTS "templates_select" ON deployment_templates;
CREATE POLICY "templates_select" ON deployment_templates FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "templates_insert" ON deployment_templates;
CREATE POLICY "templates_insert" ON deployment_templates FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "templates_update" ON deployment_templates;
CREATE POLICY "templates_update" ON deployment_templates FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "templates_delete" ON deployment_templates;
CREATE POLICY "templates_delete" ON deployment_templates FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id = ANY (get_user_ares_groups(auth.uid()))));

-- ics205_forms (legacy per-site form; retired by Phase 2)
DROP POLICY IF EXISTS "ics205_select" ON ics205_forms;
CREATE POLICY "ics205_select" ON ics205_forms FOR SELECT TO authenticated
  USING (location_visible(deployment_location_id));
DROP POLICY IF EXISTS "ics205_insert" ON ics205_forms;
CREATE POLICY "ics205_insert" ON ics205_forms FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "ics205_update" ON ics205_forms;
CREATE POLICY "ics205_update" ON ics205_forms FOR UPDATE TO authenticated
  USING (has_role('admin', 'planner') AND location_visible(deployment_location_id))
  WITH CHECK (has_role('admin', 'planner') AND location_visible(deployment_location_id));
DROP POLICY IF EXISTS "ics205_delete" ON ics205_forms;
CREATE POLICY "ics205_delete" ON ics205_forms FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND location_visible(deployment_location_id));

-- events (task event log): attributed, role-checked, deployment-scoped
DROP POLICY IF EXISTS "events_select" ON events;
CREATE POLICY "events_select" ON events FOR SELECT TO authenticated
  USING (is_admin() OR actor_user_id = auth.uid() OR (deployment_id IS NOT NULL AND deployment_visible(deployment_id)));
DROP POLICY IF EXISTS "events_insert" ON events;
CREATE POLICY "events_insert" ON events FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND has_role('admin', 'planner', 'operator')
    AND deployment_id IS NOT NULL
    AND deployment_visible(deployment_id)
  );

-- notifications: only planners/admins insert directly; triggers bypass RLS
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner'));

-- ============================================================
-- 7. Function hardening
-- ============================================================
ALTER FUNCTION update_updated_at() SET search_path = public;
ALTER FUNCTION handle_new_user() SET search_path = public;
ALTER FUNCTION materialize_task_event() SET search_path = public;
ALTER FUNCTION notify_user_by_callsign(TEXT, TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION notify_deployment_creator(UUID, TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION trigger_notify_task_assigned() SET search_path = public;
ALTER FUNCTION trigger_notify_task_completed() SET search_path = public;
ALTER FUNCTION trigger_notify_equipment_shortage() SET search_path = public;

-- Trigger and internal functions are never called by clients
REVOKE EXECUTE ON FUNCTION update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION materialize_task_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION notify_user_by_callsign(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION notify_deployment_creator(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION trigger_notify_task_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION trigger_notify_task_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION trigger_notify_equipment_shortage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_user_group_mirror(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION memberships_mirror_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION users_protect_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION notify_admins_membership_request() FROM PUBLIC, anon, authenticated;

-- Policy helpers: callable by signed-in users only (policies run as the caller)
REVOKE EXECUTE ON FUNCTION get_user_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_user_ares_groups(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION has_role(TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION deployment_visible(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION location_visible(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION shares_group_with(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_user_role(UUID), get_user_ares_groups(UUID), is_admin(), has_role(TEXT[]),
  deployment_visible(UUID), location_visible(UUID), shares_group_with(UUID) TO authenticated;
