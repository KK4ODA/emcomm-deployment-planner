-- EmComm Planner: Row-Level Security Policies
-- Run this AFTER 001_initial_schema.sql

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ares_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ics205_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS: All authenticated can read, own row or admin can update
-- ============================================================
CREATE POLICY "users_select" ON users FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "users_insert" ON users FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "users_update" ON users FOR UPDATE
  TO authenticated USING (
    id = auth.uid() OR get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "users_delete" ON users FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- ARES GROUPS: All authenticated can read, admin can write
-- ============================================================
CREATE POLICY "ares_groups_select" ON ares_groups FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "ares_groups_insert" ON ares_groups FOR INSERT
  TO authenticated WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "ares_groups_update" ON ares_groups FOR UPDATE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "ares_groups_delete" ON ares_groups FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- DEPLOYMENTS: Read by ARES group membership or admin, write by admin
-- ============================================================
CREATE POLICY "deployments_select" ON deployments FOR SELECT
  TO authenticated USING (
    get_user_role(auth.uid()) = 'admin'
    OR ares_group_id = ANY(get_user_ares_groups(auth.uid()))
  );

CREATE POLICY "deployments_insert" ON deployments FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "deployments_update" ON deployments FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "deployments_delete" ON deployments FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- DEPLOYMENT LOCATIONS: Through deployment access
-- ============================================================
CREATE POLICY "locations_select" ON deployment_locations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "locations_insert" ON deployment_locations FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "locations_update" ON deployment_locations FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "locations_delete" ON deployment_locations FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- CATEGORIES: Through deployment access
-- ============================================================
CREATE POLICY "categories_select" ON categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "categories_insert" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "categories_update" ON categories FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "categories_delete" ON categories FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- DEPLOYMENT ITEMS: Admin/operator can write
-- ============================================================
CREATE POLICY "items_select" ON deployment_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "items_insert" ON deployment_items FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "items_update" ON deployment_items FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "items_delete" ON deployment_items FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- TASKS: Admin/operator can write
-- ============================================================
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "tasks_delete" ON tasks FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- DEPLOYMENT TEMPLATES: Admin can write, all can read
-- ============================================================
CREATE POLICY "templates_select" ON deployment_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "templates_insert" ON deployment_templates FOR INSERT
  TO authenticated WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "templates_update" ON deployment_templates FOR UPDATE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "templates_delete" ON deployment_templates FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- ICS 205 FORMS: Admin/operator can write
-- ============================================================
CREATE POLICY "ics205_select" ON ics205_forms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "ics205_insert" ON ics205_forms FOR INSERT
  TO authenticated WITH CHECK (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "ics205_update" ON ics205_forms FOR UPDATE
  TO authenticated USING (
    get_user_role(auth.uid()) IN ('admin', 'operator')
  );

CREATE POLICY "ics205_delete" ON ics205_forms FOR DELETE
  TO authenticated USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- NOTIFICATIONS: Users can only see/manage their own
-- ============================================================
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (
    user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (
    user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated USING (
    user_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
