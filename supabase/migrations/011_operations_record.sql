-- 011: Operations and the record (Phase 3)
--
-- activity_log   append-only record of check-ins, status changes and notes
--                (the ICS-214 source)
-- hour_entries   participation hours, derived from assignments on release
--                (estimated from the shift when a check-out is missing) or
--                entered manually for non-event work
-- set_assignment_status(...)  idempotent RPC used by the offline intents
--                outbox: applies the monotonic status ladder, stamps the
--                time the operator actually pressed the button, logs once.

-- ============================================================
-- 1. Activity log
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id            BIGSERIAL PRIMARY KEY,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  position_id   UUID REFERENCES positions(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,      -- who the entry is about
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,      -- who entered it (NCS may log for others)
  kind          TEXT NOT NULL
    CHECK (kind IN ('check_in', 'on_position', 'check_out', 'status', 'note', 'incident', 'comms_failure', 'equipment_problem')),
  summary       TEXT NOT NULL,
  detail        JSONB,
  intent_id     TEXT UNIQUE,                                        -- idempotency key from the client outbox
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_deployment_idx ON activity_log (deployment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON activity_log (user_id, occurred_at DESC);

-- ============================================================
-- 2. Hour entries
-- ============================================================
CREATE TABLE IF NOT EXISTS hour_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ares_group_id TEXT,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  assignment_id UUID UNIQUE REFERENCES assignments(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL DEFAULT 'public_service'
    CHECK (activity_type IN ('emergency', 'public_service', 'training', 'net', 'admin', 'maintenance')),
  occurred_on   DATE NOT NULL,
  hours         NUMERIC(6,2) NOT NULL CHECK (hours >= 0 AND hours <= 48),
  source        TEXT NOT NULL DEFAULT 'derived' CHECK (source IN ('derived', 'manual')),
  estimated     BOOLEAN NOT NULL DEFAULT false,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hour_entries_user_idx ON hour_entries (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS hour_entries_group_idx ON hour_entries (ares_group_id, occurred_on DESC);
DROP TRIGGER IF EXISTS hour_entries_updated_at ON hour_entries;
CREATE TRIGGER hour_entries_updated_at BEFORE UPDATE ON hour_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. Derive hours when an assignment is released
-- ============================================================
CREATE OR REPLACE FUNCTION derive_hours_for_assignment(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a          assignments%ROWTYPE;
  s          shifts%ROWTYPE;
  d          deployments%ROWTYPE;
  v_start    TIMESTAMPTZ;
  v_end      TIMESTAMPTZ;
  v_hours    NUMERIC(6,2);
  v_est      BOOLEAN := false;
  v_activity TEXT;
BEGIN
  SELECT * INTO a FROM assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM shifts WHERE id = a.shift_id;
  SELECT * INTO d FROM deployments WHERE id = a.deployment_id;

  v_start := COALESCE(a.checked_in_at, s.starts_at);
  v_end   := COALESCE(a.released_at, s.ends_at);
  IF a.checked_in_at IS NULL OR a.released_at IS NULL THEN v_est := true; END IF;
  IF v_end <= v_start THEN v_end := s.ends_at; v_est := true; END IF;
  v_hours := ROUND(EXTRACT(EPOCH FROM (v_end - v_start)) / 3600.0, 2);
  IF v_hours < 0 THEN v_hours := 0; END IF;
  IF v_hours > 48 THEN v_hours := 48; v_est := true; END IF;

  v_activity := CASE d.profile
    WHEN 'activation' THEN 'emergency'
    WHEN 'public_service' THEN 'public_service'
    WHEN 'net' THEN 'net'
    ELSE 'training' END;

  INSERT INTO hour_entries (ares_group_id, user_id, deployment_id, assignment_id, activity_type, occurred_on, hours, source, estimated, description)
  VALUES (d.ares_group_id, a.user_id, a.deployment_id, a.id, v_activity, (v_start AT TIME ZONE 'UTC')::date, v_hours, 'derived', v_est,
          d.name || ' — ' || COALESCE((SELECT name FROM positions WHERE id = s.position_id), 'assignment'))
  ON CONFLICT (assignment_id) DO UPDATE
    SET hours = EXCLUDED.hours, estimated = EXCLUDED.estimated, occurred_on = EXCLUDED.occurred_on,
        activity_type = EXCLUDED.activity_type, description = EXCLUDED.description, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION derive_hours_for_assignment(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trigger_assignment_record()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pos_id UUID;
  pos_name TEXT;
  who TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- The RPC logs with an intent id; everything else is logged here.
    IF current_setting('emcomm.logged', true) IS DISTINCT FROM 'on' THEN
      SELECT p.id, p.name INTO pos_id, pos_name FROM shifts s JOIN positions p ON p.id = s.position_id WHERE s.id = NEW.shift_id;
      SELECT COALESCE(NULLIF(call_sign, ''), full_name, email) INTO who FROM users WHERE id = NEW.user_id;
      INSERT INTO activity_log (deployment_id, assignment_id, position_id, user_id, recorded_by, kind, summary, occurred_at)
      VALUES (NEW.deployment_id, NEW.id, pos_id, NEW.user_id, auth.uid(),
              CASE NEW.status WHEN 'checked_in' THEN 'check_in' WHEN 'on_position' THEN 'on_position' WHEN 'released' THEN 'check_out' ELSE 'status' END,
              COALESCE(who, 'Operator') || ' ' || replace(NEW.status, '_', ' ') || COALESCE(' — ' || pos_name, ''),
              COALESCE(CASE NEW.status WHEN 'checked_in' THEN NEW.checked_in_at WHEN 'on_position' THEN NEW.on_position_at WHEN 'released' THEN NEW.released_at END, now()));
    END IF;
    IF NEW.status = 'released' THEN PERFORM derive_hours_for_assignment(NEW.id); END IF;
  ELSIF NEW.status = 'released' AND (NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at) THEN
    PERFORM derive_hours_for_assignment(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION trigger_assignment_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assignments_record ON assignments;
CREATE TRIGGER assignments_record
  AFTER UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_assignment_record();

-- ============================================================
-- 4. Idempotent status RPC for the offline outbox
-- ============================================================
CREATE OR REPLACE FUNCTION set_assignment_status(
  p_assignment_id UUID,
  p_status        TEXT,
  p_at            TIMESTAMPTZ DEFAULT now(),
  p_note          TEXT DEFAULT NULL,
  p_intent_id     TEXT DEFAULT NULL
)
RETURNS assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller      UUID := auth.uid();
  caller_role TEXT;
  a           assignments%ROWTYPE;
  rank_now    INTEGER;
  rank_new    INTEGER;
  pos_id      UUID;
  pos_name    TEXT;
  who         TEXT;
  inserted    BOOLEAN := false;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  caller_role := COALESCE(get_user_role(caller), 'pending');
  SELECT * INTO a FROM assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT deployment_visible(a.deployment_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF caller_role NOT IN ('admin', 'planner') AND a.user_id <> caller THEN
    RAISE EXCEPTION 'You can only update your own assignment' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('accepted', 'declined', 'checked_in', 'on_position', 'released', 'no_show', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = '22023';
  END IF;

  -- Idempotency: an intent replayed twice is applied once.
  IF p_intent_id IS NOT NULL THEN
    SELECT p.id, p.name INTO pos_id, pos_name FROM shifts s JOIN positions p ON p.id = s.position_id WHERE s.id = a.shift_id;
    SELECT COALESCE(NULLIF(call_sign, ''), full_name, email) INTO who FROM users WHERE id = a.user_id;
    INSERT INTO activity_log (deployment_id, assignment_id, position_id, user_id, recorded_by, kind, summary, detail, intent_id, occurred_at)
    VALUES (a.deployment_id, a.id, pos_id, a.user_id, caller,
            CASE p_status WHEN 'checked_in' THEN 'check_in' WHEN 'on_position' THEN 'on_position' WHEN 'released' THEN 'check_out' ELSE 'status' END,
            COALESCE(who, 'Operator') || ' ' || replace(p_status, '_', ' ') || COALESCE(' — ' || pos_name, '') || COALESCE(' (' || p_note || ')', ''),
            CASE WHEN p_note IS NOT NULL THEN jsonb_build_object('note', p_note) END,
            p_intent_id, COALESCE(p_at, now()))
    ON CONFLICT (intent_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF NOT inserted THEN RETURN a; END IF;
  END IF;

  -- Monotonic ladder for the field statuses; planners may set anything.
  rank_now := CASE a.status WHEN 'offered' THEN 0 WHEN 'accepted' THEN 1 WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 WHEN 'released' THEN 4 ELSE 9 END;
  rank_new := CASE p_status WHEN 'offered' THEN 0 WHEN 'accepted' THEN 1 WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 WHEN 'released' THEN 4 ELSE 9 END;

  PERFORM set_config('emcomm.logged', CASE WHEN p_intent_id IS NOT NULL THEN 'on' ELSE 'off' END, true);

  IF caller_role NOT IN ('admin', 'planner') THEN
    IF p_status IN ('no_show', 'cancelled') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
    IF p_status = 'declined' AND a.status NOT IN ('offered', 'accepted') THEN RAISE EXCEPTION 'Cannot decline now' USING ERRCODE = '42501'; END IF;
    IF rank_new <= rank_now AND p_status <> 'declined' THEN
      -- late-arriving earlier status: keep the record, only backfill a missing timestamp
      UPDATE assignments SET
        checked_in_at  = CASE WHEN p_status = 'checked_in'  THEN COALESCE(checked_in_at, p_at) ELSE checked_in_at END,
        on_position_at = CASE WHEN p_status = 'on_position' THEN COALESCE(on_position_at, p_at) ELSE on_position_at END
      WHERE id = a.id RETURNING * INTO a;
      PERFORM set_config('emcomm.logged', 'off', true);
      RETURN a;
    END IF;
  END IF;

  UPDATE assignments SET
    status         = p_status,
    decline_reason = CASE WHEN p_status = 'declined' THEN COALESCE(p_note, decline_reason) ELSE decline_reason END,
    notes          = CASE WHEN p_status <> 'declined' AND p_note IS NOT NULL THEN p_note ELSE notes END,
    accepted_at    = CASE WHEN p_status = 'accepted'    THEN COALESCE(accepted_at, p_at)    ELSE accepted_at END,
    declined_at    = CASE WHEN p_status = 'declined'    THEN COALESCE(declined_at, p_at)    ELSE declined_at END,
    checked_in_at  = CASE WHEN p_status = 'checked_in'  THEN COALESCE(checked_in_at, p_at)
                          WHEN p_status IN ('on_position', 'released') THEN COALESCE(checked_in_at, p_at) ELSE checked_in_at END,
    on_position_at = CASE WHEN p_status = 'on_position' THEN COALESCE(on_position_at, p_at) ELSE on_position_at END,
    released_at    = CASE WHEN p_status = 'released'    THEN COALESCE(released_at, p_at)    ELSE released_at END
  WHERE id = a.id
  RETURNING * INTO a;

  PERFORM set_config('emcomm.logged', 'off', true);
  RETURN a;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_assignment_status(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_assignment_status(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hour_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_select" ON activity_log;
CREATE POLICY "activity_select" ON activity_log FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid() OR (deployment_id IS NOT NULL AND deployment_visible(deployment_id)));
DROP POLICY IF EXISTS "activity_insert" ON activity_log;
CREATE POLICY "activity_insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND deployment_id IS NOT NULL AND deployment_visible(deployment_id)
    AND (has_role('admin', 'planner') OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "hours_select" ON hour_entries;
CREATE POLICY "hours_select" ON hour_entries FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid() OR (has_role('admin', 'planner') AND ares_group_id = ANY (get_user_ares_groups(auth.uid()))));
DROP POLICY IF EXISTS "hours_insert" ON hour_entries;
CREATE POLICY "hours_insert" ON hour_entries FOR INSERT TO authenticated
  WITH CHECK (source = 'manual' AND (user_id = auth.uid() OR has_role('admin', 'planner')));
DROP POLICY IF EXISTS "hours_update" ON hour_entries;
CREATE POLICY "hours_update" ON hour_entries FOR UPDATE TO authenticated
  USING (is_admin() OR (user_id = auth.uid() AND source = 'manual'))
  WITH CHECK (is_admin() OR (user_id = auth.uid() AND source = 'manual'));
DROP POLICY IF EXISTS "hours_delete" ON hour_entries;
CREATE POLICY "hours_delete" ON hour_entries FOR DELETE TO authenticated
  USING (is_admin() OR (user_id = auth.uid() AND source = 'manual'));

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE activity_log; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
