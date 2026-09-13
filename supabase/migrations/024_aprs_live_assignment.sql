-- 024_aprs_live_assignment.sql
-- One definition of "the operator's live assignment" for every APRS command.
--
-- Before this, @@#status answered with the operator's newest accepted
-- assignment in any deployment (so it named a Winter Field Day slot months
-- away), while check-ins used the shift window. Now status, check-ins and
-- task steps all pick the shift that is running (or the next one within 12
-- hours) in a planning/active deployment of the bridge's own ARES group.
-- Status also tells the operator their next shift when nothing is live.

CREATE OR REPLACE FUNCTION aprs_live_assignment(p_user_id UUID, p_at TIMESTAMPTZ DEFAULT now(), p_group_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id
    FROM assignments a
    JOIN shifts s ON s.id = a.shift_id
    JOIN deployments d ON d.id = a.deployment_id
   WHERE a.user_id = p_user_id
     AND a.status IN ('accepted', 'checked_in', 'on_position')
     AND d.status IN ('planning', 'active')
     AND (p_group_id IS NULL OR d.ares_group_id = p_group_id::text)
     AND s.ends_at > p_at - interval '2 hours'
     AND s.starts_at < p_at + interval '12 hours'
   ORDER BY (s.starts_at <= p_at AND s.ends_at >= p_at) DESC, s.starts_at
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION aprs_live_assignment(UUID, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

-- Check-in ladder over APRS, now scoped to the bridge's group.
DROP FUNCTION IF EXISTS apply_aprs_status(UUID, TEXT, TIMESTAMPTZ, TEXT);
CREATE OR REPLACE FUNCTION apply_aprs_status(p_user_id UUID, p_status TEXT, p_at TIMESTAMPTZ DEFAULT now(), p_note TEXT DEFAULT NULL, p_group_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a assignments%ROWTYPE;
  pos_name TEXT; tac TEXT; rank_now INT; rank_new INT;
BEGIN
  IF p_status NOT IN ('checked_in', 'on_position', 'released') THEN
    RETURN jsonb_build_object('result', 'not_allowed', 'reply', 'unknown status');
  END IF;
  SELECT * INTO a FROM assignments WHERE id = aprs_live_assignment(p_user_id, p_at, p_group_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'no_assignment', 'reply', 'no shift found for you today');
  END IF;
  SELECT p.name, p.tactical_callsign INTO pos_name, tac FROM shifts s JOIN positions p ON p.id = s.position_id WHERE s.id = a.shift_id;

  rank_now := CASE a.status WHEN 'accepted' THEN 1 WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 ELSE 9 END;
  rank_new := CASE p_status WHEN 'checked_in' THEN 2 WHEN 'on_position' THEN 3 WHEN 'released' THEN 4 END;
  IF rank_new <= rank_now THEN
    RETURN jsonb_build_object('result', 'ok', 'assignment_id', a.id, 'reply', format('already %s at %s', replace(a.status, '_', ' '), COALESCE(tac, pos_name)));
  END IF;

  PERFORM set_config('emcomm.logged', 'on', true);
  UPDATE assignments
     SET status = p_status,
         checked_in_at  = CASE WHEN p_status IN ('checked_in', 'on_position') THEN COALESCE(checked_in_at, p_at) ELSE checked_in_at END,
         on_position_at = CASE WHEN p_status = 'on_position' THEN COALESCE(on_position_at, p_at) ELSE on_position_at END,
         released_at    = CASE WHEN p_status = 'released' THEN COALESCE(released_at, p_at) ELSE released_at END
   WHERE id = a.id RETURNING * INTO a;
  PERFORM set_config('emcomm.logged', 'off', true);
  INSERT INTO activity_log (deployment_id, assignment_id, position_id, user_id, recorded_by, kind, summary, occurred_at, intent_id)
  SELECT a.deployment_id, a.id, s.position_id, a.user_id, NULL,
         CASE p_status WHEN 'checked_in' THEN 'check_in' WHEN 'on_position' THEN 'on_position' ELSE 'check_out' END,
         format('%s %s via APRS%s', COALESCE((SELECT call_sign FROM users WHERE id = a.user_id), 'operator'), replace(p_status, '_', ' '), CASE WHEN p_note IS NOT NULL THEN ': ' || p_note ELSE '' END),
         p_at, 'aprs:' || a.id || ':' || p_status || ':' || to_char(p_at, 'YYYYMMDDHH24MI')
    FROM shifts s WHERE s.id = a.shift_id
  ON CONFLICT (intent_id) DO NOTHING;
  RETURN jsonb_build_object('result', 'ok', 'assignment_id', a.id, 'reply', format('%s %s %s', COALESCE(tac, pos_name), replace(p_status, '_', ' '), to_char(p_at AT TIME ZONE 'UTC', 'HH24:MI') || 'z'));
END;
$$;
REVOKE ALL ON FUNCTION apply_aprs_status(UUID, TEXT, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Task steps over APRS: only live deployments of the bridge's group, and the
-- deployment of the live shift first when the operator has several.
DROP FUNCTION IF EXISTS apply_aprs_task(UUID, TEXT, INT, TEXT, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION apply_aprs_task(p_user_id UUID, p_status TEXT, p_seq INT DEFAULT NULL, p_note TEXT DEFAULT NULL, p_at TIMESTAMPTZ DEFAULT now(), p_group_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t ops_tasks; tac TEXT; live_dep UUID;
BEGIN
  IF p_status NOT IN ('acknowledged', 'en_route', 'on_scene', 'complete') THEN RETURN jsonb_build_object('result', 'not_allowed', 'reply', 'use #ack #enroute #onscene #done'); END IF;
  SELECT deployment_id INTO live_dep FROM assignments WHERE id = aprs_live_assignment(p_user_id, p_at, p_group_id);
  SELECT t2.* INTO t
    FROM ops_tasks t2
    JOIN deployments d ON d.id = t2.deployment_id AND d.status IN ('planning', 'active') AND (p_group_id IS NULL OR d.ares_group_id = p_group_id::text)
    JOIN assignments a ON a.deployment_id = t2.deployment_id AND a.user_id = p_user_id AND a.status IN ('accepted', 'checked_in', 'on_position')
    JOIN shifts s ON s.id = a.shift_id
   WHERE t2.status IN ('issued', 'acknowledged', 'en_route', 'on_scene')
     AND (t2.assignment_id = a.id OR t2.position_id = s.position_id OR (t2.position_id IS NULL AND t2.assignment_id IS NULL))
     AND (p_seq IS NULL OR t2.seq = p_seq)
   ORDER BY (t2.deployment_id = live_dep) DESC, (t2.assignment_id = a.id) DESC, t2.issued_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'no_task', 'reply', CASE WHEN p_seq IS NULL THEN 'no open task for you' ELSE format('task %s is not yours or not open', p_seq) END); END IF;
  t := set_task_state(t.id, p_status, p_at, p_note, 'aprs:task:' || t.id || ':' || p_status || ':' || to_char(p_at, 'YYYYMMDDHH24MI'), p_user_id);
  SELECT COALESCE(p.tactical_callsign, p.name) INTO tac FROM positions p WHERE p.id = t.position_id;
  RETURN jsonb_build_object('result', 'ok', 'task_id', t.id, 'reply', format('task %s %s%s', t.seq, replace(t.status, '_', ' '), COALESCE(' ' || tac, '')));
END;
$$;
REVOKE ALL ON FUNCTION apply_aprs_task(UUID, TEXT, INT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

-- @@#status: the live shift and its open tasks, else the next shift.
CREATE OR REPLACE FUNCTION aprs_status_reply(p_user_id UUID, p_group_id UUID DEFAULT NULL, p_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a assignments%ROWTYPE; unit TEXT; pos_id UUID; n_open INT; first_task RECORD; nxt RECORD; reply TEXT;
BEGIN
  SELECT * INTO a FROM assignments WHERE id = aprs_live_assignment(p_user_id, p_at, p_group_id);
  IF FOUND THEN
    SELECT COALESCE(p.tactical_callsign, p.name), p.id INTO unit, pos_id FROM shifts s JOIN positions p ON p.id = s.position_id WHERE s.id = a.shift_id;
    SELECT count(*) INTO n_open FROM ops_tasks t
     WHERE t.deployment_id = a.deployment_id AND t.status IN ('issued', 'acknowledged', 'en_route', 'on_scene')
       AND (t.assignment_id = a.id OR (t.assignment_id IS NULL AND t.position_id = pos_id) OR (t.assignment_id IS NULL AND t.position_id IS NULL));
    reply := format('%s: %s', unit, replace(a.status, '_', ' '));
    IF n_open > 0 THEN
      SELECT t.seq, t.status INTO first_task FROM ops_tasks t
       WHERE t.deployment_id = a.deployment_id AND t.status IN ('issued', 'acknowledged', 'en_route', 'on_scene')
         AND (t.assignment_id = a.id OR (t.assignment_id IS NULL AND t.position_id = pos_id) OR (t.assignment_id IS NULL AND t.position_id IS NULL))
       ORDER BY (t.assignment_id = a.id) DESC, t.issued_at DESC LIMIT 1;
      reply := reply || format('; task %s %s%s', first_task.seq, replace(first_task.status, '_', ' '), CASE WHEN n_open > 1 THEN format(' +%s', n_open - 1) ELSE '' END);
    END IF;
    RETURN jsonb_build_object('result', 'ok', 'assignment_id', a.id, 'reply', left(reply, 63));
  END IF;
  -- Nothing live: say when the next shift is, in UTC, so the operator knows they are known.
  SELECT COALESCE(p.tactical_callsign, p.name) AS unit, s.starts_at INTO nxt
    FROM assignments a2 JOIN shifts s ON s.id = a2.shift_id JOIN positions p ON p.id = s.position_id JOIN deployments d ON d.id = a2.deployment_id
   WHERE a2.user_id = p_user_id AND a2.status IN ('accepted', 'checked_in', 'on_position')
     AND d.status IN ('planning', 'active') AND (p_group_id IS NULL OR d.ares_group_id = p_group_id::text) AND s.starts_at > p_at
   ORDER BY s.starts_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('result', 'ok', 'reply', left(format('no shift now; next %s %sz', nxt.unit, to_char(nxt.starts_at AT TIME ZONE 'UTC', 'Mon DD HH24:MI')), 63));
  END IF;
  RETURN jsonb_build_object('result', 'ok', 'reply', 'no live assignment');
END;
$$;
REVOKE ALL ON FUNCTION aprs_status_reply(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
