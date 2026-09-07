-- 009: Staffing model (Phase 1 of docs/IMPLEMENTATION_ROADMAP.md)
--
-- Adds operational periods, positions, shifts and assignments; operator
-- capability fields; site logistics fields; deployment schedule and
-- authorization fields; plan versioning. Migrates existing site rosters
-- (deployment_locations.assigned_call_signs) into one position per site.
-- Additive: no existing column is dropped.

-- ============================================================
-- 1. Deployments: real timestamps, profile, authorization, plan version
-- ============================================================
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile TEXT NOT NULL DEFAULT 'public_service',
  ADD COLUMN IF NOT EXISTS served_agency TEXT,
  ADD COLUMN IF NOT EXISTS requesting_official TEXT,
  ADD COLUMN IF NOT EXISTS tasking_reference TEXT,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_change_note TEXT;

ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_profile_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_profile_check
  CHECK (profile IN ('public_service', 'activation', 'exercise', 'field_day', 'net', 'training'));

UPDATE deployments SET starts_at = start_date::timestamptz WHERE starts_at IS NULL AND start_date IS NOT NULL;
UPDATE deployments SET ends_at = (end_date + 1)::timestamptz WHERE ends_at IS NULL AND end_date IS NOT NULL;

-- ============================================================
-- 2. Sites: what an operator needs on arrival
-- ============================================================
ALTER TABLE deployment_locations
  ADD COLUMN IF NOT EXISTS site_type TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS parking_notes TEXT,
  ADD COLUMN IF NOT EXISTS arrival_notes TEXT,
  ADD COLUMN IF NOT EXISTS access_notes TEXT;

-- ============================================================
-- 3. Operators: the short capability profile
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS license_class TEXT,
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS station_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS power_hours NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS locality TEXT,
  ADD COLUMN IF NOT EXISTS equipment_notes TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_license_class_check;
ALTER TABLE users ADD CONSTRAINT users_license_class_check
  CHECK (license_class IS NULL OR license_class IN ('technician', 'general', 'extra', 'none', 'other'));

-- ============================================================
-- 4. Operational periods
-- ============================================================
CREATE TABLE IF NOT EXISTS operational_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  sequence      INTEGER NOT NULL DEFAULT 1,
  label         TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT operational_periods_order CHECK (ends_at > starts_at),
  UNIQUE (deployment_id, sequence)
);
DROP TRIGGER IF EXISTS operational_periods_updated_at ON operational_periods;
CREATE TRIGGER operational_periods_updated_at BEFORE UPDATE ON operational_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. Positions: a job, optionally at a site
-- ============================================================
CREATE TABLE IF NOT EXISTS positions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id          UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  site_id                UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  tactical_callsign      TEXT,
  position_type          TEXT,
  net                    TEXT,
  headcount              INTEGER NOT NULL DEFAULT 1 CHECK (headcount > 0),
  -- [{ kind: 'capability'|'station_type'|'power_hours'|'license_class'|'other', value, mandatory, notes }]
  requirements           JSONB NOT NULL DEFAULT '[]',
  briefing_notes         TEXT,
  supervisor_position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  sort_order             INTEGER DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS positions_deployment_idx ON positions (deployment_id, sort_order);
DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. Shifts: a time window on a position
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id           UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  deployment_id         UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  operational_period_id UUID REFERENCES operational_periods(id) ON DELETE SET NULL,
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  muster_at             TIMESTAMPTZ,
  headcount             INTEGER CHECK (headcount IS NULL OR headcount > 0),  -- null = position headcount
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT shifts_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS shifts_position_idx ON shifts (position_id, starts_at);
CREATE INDEX IF NOT EXISTS shifts_deployment_idx ON shifts (deployment_id, starts_at);
DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. Assignments: one operator on one shift (plan, acknowledgement, record)
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id            UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  deployment_id       UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered', 'accepted', 'declined', 'checked_in', 'on_position', 'released', 'no_show', 'cancelled')),
  offered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  checked_in_at       TIMESTAMPTZ,
  on_position_at      TIMESTAMPTZ,
  released_at         TIMESTAMPTZ,
  decline_reason      TEXT,
  packet_version_seen INTEGER,
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (shift_id, user_id)
);
CREATE INDEX IF NOT EXISTS assignments_user_idx ON assignments (user_id, status);
CREATE INDEX IF NOT EXISTS assignments_deployment_idx ON assignments (deployment_id, status);
DROP TRIGGER IF EXISTS assignments_updated_at ON assignments;
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Guard: an operator may only move their own assignment along the ladder and
-- touch notes / packet_version_seen; planners and admins may do anything.
-- Also stamps transition timestamps for every caller.
CREATE OR REPLACE FUNCTION assignments_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
  caller_role TEXT;
  allowed BOOLEAN;
BEGIN
  caller_role := CASE WHEN caller IS NULL THEN 'admin' ELSE COALESCE(get_user_role(caller), 'pending') END;

  IF TG_OP = 'UPDATE' AND caller_role NOT IN ('admin', 'planner') THEN
    IF OLD.user_id IS DISTINCT FROM caller THEN
      RAISE EXCEPTION 'You can only update your own assignment' USING ERRCODE = '42501';
    END IF;
    NEW.shift_id      := OLD.shift_id;
    NEW.user_id       := OLD.user_id;
    NEW.deployment_id := OLD.deployment_id;
    NEW.created_by    := OLD.created_by;
    NEW.offered_at    := OLD.offered_at;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      allowed := (OLD.status = 'offered'     AND NEW.status IN ('accepted', 'declined'))
              OR (OLD.status = 'accepted'    AND NEW.status IN ('declined', 'checked_in', 'on_position', 'released'))
              OR (OLD.status = 'checked_in'  AND NEW.status IN ('on_position', 'released'))
              OR (OLD.status = 'on_position' AND NEW.status IN ('released'));
      IF NOT allowed THEN
        RAISE EXCEPTION 'Status change % -> % is not allowed', OLD.status, NEW.status USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted'    THEN NEW.accepted_at    := COALESCE(NEW.accepted_at, now()); END IF;
    IF NEW.status = 'declined'    THEN NEW.declined_at    := COALESCE(NEW.declined_at, now()); END IF;
    IF NEW.status = 'checked_in'  THEN NEW.checked_in_at  := COALESCE(NEW.checked_in_at, now()); END IF;
    IF NEW.status = 'on_position' THEN
      NEW.on_position_at := COALESCE(NEW.on_position_at, now());
      NEW.checked_in_at  := COALESCE(NEW.checked_in_at, NEW.on_position_at);
    END IF;
    IF NEW.status = 'released'    THEN NEW.released_at    := COALESCE(NEW.released_at, now()); END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION assignments_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assignments_guard ON assignments;
CREATE TRIGGER assignments_guard
  BEFORE INSERT OR UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION assignments_before_write();

-- Notifications: offer → operator; accept/decline → deployment creator
CREATE OR REPLACE FUNCTION trigger_notify_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pos_name  TEXT;
  dep_name  TEXT;
  op_email  TEXT;
  op_sign   TEXT;
BEGIN
  SELECT p.name, d.name INTO pos_name, dep_name
  FROM shifts s JOIN positions p ON p.id = s.position_id JOIN deployments d ON d.id = p.deployment_id
  WHERE s.id = NEW.shift_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'offered' THEN
    SELECT email INTO op_email FROM users WHERE id = NEW.user_id;
    IF op_email IS NOT NULL THEN
      INSERT INTO notifications (user_email, type, title, message)
      VALUES (op_email, 'assignment_offered', 'New assignment: ' || COALESCE(pos_name, 'position'),
              'You are offered ' || COALESCE(pos_name, 'a position') || ' for ' || COALESCE(dep_name, 'a deployment') || '. Open My Assignments to accept.');
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'declined') THEN
    SELECT COALESCE(NULLIF(call_sign, ''), full_name, email) INTO op_sign FROM users WHERE id = NEW.user_id;
    PERFORM notify_deployment_creator(
      NEW.deployment_id,
      'assignment_' || NEW.status,
      COALESCE(op_sign, 'An operator') || ' ' || NEW.status || ': ' || COALESCE(pos_name, 'position'),
      COALESCE(op_sign, 'An operator') || ' ' || NEW.status || ' the assignment ' || COALESCE(pos_name, '') || ' in ' || COALESCE(dep_name, '')
        || CASE WHEN NEW.decline_reason IS NOT NULL THEN ' (' || NEW.decline_reason || ')' ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION trigger_notify_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assignments_notify ON assignments;
CREATE TRIGGER assignments_notify
  AFTER INSERT OR UPDATE OF status ON assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_notify_assignment();

-- ============================================================
-- 8. RLS
-- ============================================================
ALTER TABLE operational_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "periods_select" ON operational_periods;
CREATE POLICY "periods_select" ON operational_periods FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "periods_write" ON operational_periods;
CREATE POLICY "periods_write" ON operational_periods FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

DROP POLICY IF EXISTS "positions_select" ON positions;
CREATE POLICY "positions_select" ON positions FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "positions_write" ON positions;
CREATE POLICY "positions_write" ON positions FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

DROP POLICY IF EXISTS "shifts_select" ON shifts;
CREATE POLICY "shifts_select" ON shifts FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "shifts_write" ON shifts;
CREATE POLICY "shifts_write" ON shifts FOR ALL TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id))
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));

DROP POLICY IF EXISTS "assignments_select" ON assignments;
CREATE POLICY "assignments_select" ON assignments FOR SELECT TO authenticated USING (deployment_visible(deployment_id));
DROP POLICY IF EXISTS "assignments_insert" ON assignments;
CREATE POLICY "assignments_insert" ON assignments FOR INSERT TO authenticated
  WITH CHECK (has_role('admin', 'planner') AND deployment_visible(deployment_id));
DROP POLICY IF EXISTS "assignments_update" ON assignments;
CREATE POLICY "assignments_update" ON assignments FOR UPDATE TO authenticated
  USING (deployment_visible(deployment_id) AND (has_role('admin', 'planner') OR user_id = auth.uid()))
  WITH CHECK (deployment_visible(deployment_id) AND (has_role('admin', 'planner') OR user_id = auth.uid()));
DROP POLICY IF EXISTS "assignments_delete" ON assignments;
CREATE POLICY "assignments_delete" ON assignments FOR DELETE TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible(deployment_id));

-- ============================================================
-- 9. Data migration: one operational period per deployment; site rosters → positions
-- ============================================================
INSERT INTO operational_periods (deployment_id, sequence, label, starts_at, ends_at)
SELECT d.id, 1, 'Operational period 1',
       COALESCE(d.starts_at, d.created_at),
       COALESCE(d.ends_at, COALESCE(d.starts_at, d.created_at) + interval '8 hours')
FROM deployments d
WHERE NOT EXISTS (SELECT 1 FROM operational_periods op WHERE op.deployment_id = d.id);

WITH src AS (
  SELECT l.id AS site_id, l.deployment_id, l.name, l.sort_order, l.assigned_call_signs,
         COALESCE(d.starts_at, d.created_at) AS s_at,
         COALESCE(d.ends_at, COALESCE(d.starts_at, d.created_at) + interval '8 hours') AS e_at
  FROM deployment_locations l
  JOIN deployments d ON d.id = l.deployment_id
  WHERE COALESCE(array_length(l.assigned_call_signs, 1), 0) > 0
    AND NOT EXISTS (SELECT 1 FROM positions p WHERE p.site_id = l.id)
), pos AS (
  INSERT INTO positions (deployment_id, site_id, name, headcount, position_type, sort_order)
  SELECT deployment_id, site_id, name, array_length(assigned_call_signs, 1), 'station', COALESCE(sort_order, 0) FROM src
  RETURNING id, site_id, deployment_id
), sh AS (
  INSERT INTO shifts (position_id, deployment_id, starts_at, ends_at)
  SELECT p.id, p.deployment_id, s.s_at, s.e_at FROM pos p JOIN src s ON s.site_id = p.site_id
  RETURNING id, position_id
)
INSERT INTO assignments (shift_id, deployment_id, user_id, status, accepted_at)
SELECT sh.id, p.deployment_id, u.id, 'accepted', now()
FROM sh
JOIN pos p ON p.id = sh.position_id
JOIN src s ON s.site_id = p.site_id
CROSS JOIN LATERAL unnest(s.assigned_call_signs) AS cs
JOIN users u ON upper(u.call_sign) = upper(cs)
ON CONFLICT (shift_id, user_id) DO NOTHING;

-- ============================================================
-- 10. Realtime
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE positions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE assignments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE operational_periods;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
