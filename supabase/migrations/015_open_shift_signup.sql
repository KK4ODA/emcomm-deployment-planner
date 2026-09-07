-- 015_open_shift_signup.sql
-- Operators can take an open shift themselves (the sign-up sheet), instead
-- of waiting for an offer. The coordinator can close self sign-up per
-- position. Capacity is enforced on the server under a row lock.
--
-- Roadmap: Phase 4 "open-shift board".

-- ============================================================
-- 1. Per-position switch
-- ============================================================
ALTER TABLE positions ADD COLUMN IF NOT EXISTS open_signup BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN positions.open_signup IS 'Operators may take open shifts on this position themselves';

-- ============================================================
-- 2. volunteer_for_shift: take an open shift as the signed-in operator
-- ============================================================
CREATE OR REPLACE FUNCTION volunteer_for_shift(p_shift_id UUID, p_note TEXT DEFAULT NULL)
RETURNS assignments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
  s      shifts%ROWTYPE;
  p      positions%ROWTYPE;
  d      deployments%ROWTYPE;
  a      assignments%ROWTYPE;
  taken  INTEGER;
  cap    INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT has_role('admin', 'planner', 'operator') THEN
    RAISE EXCEPTION 'Your account cannot take positions yet' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR NOT deployment_visible(s.deployment_id) THEN
    RAISE EXCEPTION 'Shift not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO p FROM positions WHERE id = s.position_id;
  SELECT * INTO d FROM deployments WHERE id = s.deployment_id;

  IF d.status NOT IN ('planning', 'active') THEN
    RAISE EXCEPTION 'This deployment is not taking sign-ups' USING ERRCODE = '55000';
  END IF;
  IF NOT COALESCE(p.open_signup, true) THEN
    RAISE EXCEPTION 'This position is filled by the coordinator' USING ERRCODE = '55000';
  END IF;
  IF s.ends_at <= now() THEN
    RAISE EXCEPTION 'This shift has ended' USING ERRCODE = '55000';
  END IF;

  -- Serialize sign-ups on the same shift.
  PERFORM 1 FROM shifts WHERE id = p_shift_id FOR UPDATE;

  SELECT * INTO a FROM assignments WHERE shift_id = p_shift_id AND user_id = caller;
  IF FOUND AND a.status IN ('offered', 'accepted', 'checked_in', 'on_position', 'released') THEN
    RETURN a;  -- already on it
  END IF;

  SELECT count(*) INTO taken FROM assignments
   WHERE shift_id = p_shift_id AND status IN ('offered', 'accepted', 'checked_in', 'on_position', 'released');
  cap := COALESCE(s.headcount, p.headcount, 1);
  IF taken >= cap THEN
    RAISE EXCEPTION 'This shift is already full' USING ERRCODE = '55000';
  END IF;

  -- A previous declined/cancelled row is replaced rather than moved backwards
  -- along the ladder (the guard trigger forbids that for operators).
  IF FOUND THEN
    DELETE FROM assignments WHERE id = a.id;
  END IF;

  INSERT INTO assignments (shift_id, deployment_id, user_id, created_by, status, notes)
  VALUES (p_shift_id, s.deployment_id, caller, caller, 'accepted', NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING * INTO a;
  RETURN a;
END;
$$;

REVOKE ALL ON FUNCTION volunteer_for_shift(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION volunteer_for_shift(UUID, TEXT) TO authenticated;

-- ============================================================
-- 3. Tell the coordinator when someone signs themselves up
-- ============================================================
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
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'accepted' AND NEW.created_by = NEW.user_id THEN
    SELECT COALESCE(NULLIF(call_sign, ''), full_name, email) INTO op_sign FROM users WHERE id = NEW.user_id;
    PERFORM notify_deployment_creator(
      NEW.deployment_id,
      'assignment_accepted',
      COALESCE(op_sign, 'An operator') || ' took ' || COALESCE(pos_name, 'a position'),
      COALESCE(op_sign, 'An operator') || ' signed up for ' || COALESCE(pos_name, 'a position') || ' in ' || COALESCE(dep_name, '') || '.'
    );
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
