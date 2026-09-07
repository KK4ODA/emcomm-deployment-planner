-- 017_open_shift_notify.sql
-- Planners tell qualified operators about an open shift. The client picks
-- the operators (requirement match, no overlap); the server checks the
-- caller, restricts to members of the deployment's group, and remembers who
-- was told so the same shift is not pushed to the same person twice a day.
--
-- Roadmap: Phase 4 "open-shift board + notify qualified operators".

CREATE TABLE IF NOT EXISTS open_shift_notices (
  shift_id    UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (shift_id, user_id)
);
ALTER TABLE open_shift_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_shift_notices_select" ON open_shift_notices;
CREATE POLICY "open_shift_notices_select" ON open_shift_notices FOR SELECT TO authenticated
  USING (has_role('admin', 'planner') AND deployment_visible((SELECT deployment_id FROM shifts WHERE id = shift_id)));

CREATE OR REPLACE FUNCTION notify_open_shift(p_shift_id UUID, p_user_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        shifts%ROWTYPE;
  p        positions%ROWTYPE;
  d        deployments%ROWTYPE;
  notified INTEGER := 0;
  skipped  INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT has_role('admin', 'planner') THEN
    RAISE EXCEPTION 'Only planners and admins notify operators' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR NOT deployment_visible(s.deployment_id) THEN
    RAISE EXCEPTION 'Shift not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO p FROM positions WHERE id = s.position_id;
  SELECT * INTO d FROM deployments WHERE id = s.deployment_id;

  WITH wanted AS (
    SELECT DISTINCT u.id, u.email
      FROM unnest(COALESCE(p_user_ids, '{}')) AS w(id)
      JOIN users u ON u.id = w.id
      JOIN memberships m ON m.user_id = u.id AND m.status = 'active' AND m.ares_group_id::text = d.ares_group_id
     WHERE u.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.shift_id = p_shift_id AND a.user_id = u.id
                          AND a.status IN ('offered', 'accepted', 'checked_in', 'on_position', 'released'))
  ), fresh AS (
    SELECT w.* FROM wanted w
     WHERE NOT EXISTS (SELECT 1 FROM open_shift_notices n WHERE n.shift_id = p_shift_id AND n.user_id = w.id
                          AND n.notified_at > now() - interval '24 hours')
  ), ins AS (
    INSERT INTO notifications (user_email, type, title, message)
    SELECT f.email, 'open_shift',
           'Open shift: ' || COALESCE(p.tactical_callsign, p.name) || ' ' || to_char(s.starts_at AT TIME ZONE 'UTC', 'Dy Mon DD HH24:MI') || 'Z',
           COALESCE(p.name, 'A position') || ' in ' || COALESCE(d.name, 'a deployment') || ' still needs someone and you qualify. Open My assignments to take it.'
      FROM fresh f
    RETURNING 1
  ), mark AS (
    INSERT INTO open_shift_notices (shift_id, user_id, notified_by)
    SELECT p_shift_id, f.id, auth.uid() FROM fresh f
    ON CONFLICT (shift_id, user_id) DO UPDATE SET notified_at = now(), notified_by = EXCLUDED.notified_by
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins), (SELECT count(*) FROM wanted) - (SELECT count(*) FROM fresh)
    INTO notified, skipped;

  RETURN jsonb_build_object('notified', notified, 'skipped_recent', skipped);
END;
$$;
REVOKE ALL ON FUNCTION notify_open_shift(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notify_open_shift(UUID, UUID[]) TO authenticated;
