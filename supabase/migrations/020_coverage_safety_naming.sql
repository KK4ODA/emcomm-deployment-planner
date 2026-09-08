-- 020_coverage_safety_naming.sql
-- Three P2 items from the design document:
--   9.12 coverage log: real radio path attempts, accumulated per group
--   Safety Officer checklist as a signed artifact per deployment
--   Position naming schemes (saved "AID MILE {n}" / "AID {n}" patterns)

-- ============================================================
-- 1. Coverage log
-- ============================================================
CREATE TABLE IF NOT EXISTS coverage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  from_site_id  UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  from_label    TEXT,
  from_lat      DOUBLE PRECISION,
  from_lon      DOUBLE PRECISION,
  to_site_id    UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  to_label      TEXT,
  to_lat        DOUBLE PRECISION,
  to_lon        DOUBLE PRECISION,
  channel_name  TEXT,
  frequency_mhz NUMERIC(10, 4),
  mode          TEXT,                                  -- FM, digital, HF...
  power_w       NUMERIC(6, 1),
  antenna       TEXT,
  result        TEXT NOT NULL CHECK (result IN ('direct', 'relay', 'fail')),
  notes         TEXT,
  reported_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coverage_log_group_idx ON coverage_log (ares_group_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS coverage_log_deployment_idx ON coverage_log (deployment_id);
ALTER TABLE coverage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coverage_log_select" ON coverage_log;
CREATE POLICY "coverage_log_select" ON coverage_log FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "coverage_log_insert" ON coverage_log;
CREATE POLICY "coverage_log_insert" ON coverage_log FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner', 'operator')
              AND reported_by = auth.uid()
              AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "coverage_log_update" ON coverage_log;
CREATE POLICY "coverage_log_update" ON coverage_log FOR UPDATE TO authenticated
  USING ((reported_by = auth.uid() OR has_role('admin', 'planner')) AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK ((reported_by = auth.uid() OR has_role('admin', 'planner')) AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "coverage_log_delete" ON coverage_log;
CREATE POLICY "coverage_log_delete" ON coverage_log FOR DELETE TO authenticated
  USING ((reported_by = auth.uid() OR has_role('admin', 'planner')) AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));

-- ============================================================
-- 2. Safety checklist, one per deployment, immutable once signed
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_checklists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL UNIQUE REFERENCES deployments(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL DEFAULT 'ARRL Field Day safety check list',
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, text, state: 'pending'|'ok'|'na', note }]
  notes         TEXT,
  signed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  signed_name   TEXT,
  signed_at     TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS safety_checklists_updated_at ON safety_checklists;
CREATE TRIGGER safety_checklists_updated_at BEFORE UPDATE ON safety_checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION safety_checklists_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A signed safety checklist cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.signed_at IS NOT NULL AND OLD.signed_at IS NULL THEN
    NEW.signed_by := auth.uid();
    NEW.signed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS safety_checklists_guard ON safety_checklists;
CREATE TRIGGER safety_checklists_guard BEFORE UPDATE ON safety_checklists FOR EACH ROW EXECUTE FUNCTION safety_checklists_guard();

ALTER TABLE safety_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety_checklists_select" ON safety_checklists;
CREATE POLICY "safety_checklists_select" ON safety_checklists FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "safety_checklists_write" ON safety_checklists;
CREATE POLICY "safety_checklists_write" ON safety_checklists FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- ============================================================
-- 3. Naming schemes per group
-- ============================================================
CREATE TABLE IF NOT EXISTS naming_schemes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id    UUID NOT NULL REFERENCES ares_groups(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  position_pattern TEXT NOT NULL,                      -- "AID MILE {n}"
  tactical_pattern TEXT,                               -- "AID {n}"
  position_type    TEXT,
  net              TEXT,
  requirements     JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS naming_schemes_group_idx ON naming_schemes (ares_group_id, sort_order);
ALTER TABLE naming_schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "naming_schemes_select" ON naming_schemes;
CREATE POLICY "naming_schemes_select" ON naming_schemes FOR SELECT TO authenticated
  USING (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid())));
DROP POLICY IF EXISTS "naming_schemes_write" ON naming_schemes;
CREATE POLICY "naming_schemes_write" ON naming_schemes FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))))
  WITH CHECK (has_role('admin', 'planner') AND (is_admin() OR ares_group_id::text = ANY (get_user_ares_groups(auth.uid()))));
