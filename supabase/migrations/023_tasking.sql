-- 023: tasking
--   ops_tasks        what the desk asked a unit to do, with a state ladder
--                    (issued > acknowledged > en_route > on_scene > complete,
--                    or cancelled), timestamps per step, and who recorded them.
--   set_task_state   idempotent RPC used by the packet (offline intents), the
--                    board and APRS commands; logs one activity_log line per
--                    change so the ICS 214 fills itself.
--   dispatch_task    creates a task, logs it and notifies the assigned operators.
--
-- Tasks are generic: a message to pass, a relay, a pick-up, a delivery, a
-- staging move, a patrol, a search, a rendezvous, a welfare/equipment check.
-- The SAG pick-up is one case, not the model.

CREATE TABLE IF NOT EXISTS ops_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  seq             INTEGER NOT NULL,                       -- short number read on the air: "task 14"
  position_id     UUID REFERENCES positions(id) ON DELETE SET NULL,   -- the unit tasked (SAG 7, RELAY 2, AID 12)
  assignment_id   UUID REFERENCES assignments(id) ON DELETE SET NULL, -- the specific operator, when known
  kind            TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN ('message', 'relay', 'pickup', 'deliver', 'stage', 'patrol', 'search', 'rendezvous', 'check', 'other')),
  priority        TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'priority', 'urgent')),
  title           TEXT NOT NULL,                          -- one line, what to do: "Pick up bib 1234 at AID 2"
  detail          TEXT,                                   -- anything else: description, condition, contact
  from_site_id    UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  to_site_id      UUID REFERENCES deployment_locations(id) ON DELETE SET NULL,
  from_text       TEXT,                                   -- free-text places when not a site
  to_text         TEXT,
  status          TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'acknowledged', 'en_route', 'on_scene', 'complete', 'cancelled')),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  en_route_at     TIMESTAMPTZ,
  on_scene_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  outcome         TEXT,                                   -- what happened, entered on complete/cancel
  issued_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, seq)
);
CREATE INDEX IF NOT EXISTS ops_tasks_deployment_status ON ops_tasks (deployment_id, status);
CREATE INDEX IF NOT EXISTS ops_tasks_position ON ops_tasks (position_id);

DROP TRIGGER IF EXISTS ops_tasks_updated_at ON ops_tasks;
CREATE TRIGGER ops_tasks_updated_at BEFORE UPDATE ON ops_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ops_tasks ENABLE ROW LEVEL SECURITY;
-- Anyone who can see the deployment can read its tasks (operators need theirs on the packet).
DROP POLICY IF EXISTS "ops_tasks_select" ON ops_tasks;
CREATE POLICY "ops_tasks_select" ON ops_tasks FOR SELECT TO authenticated
  USING (deployment_visible(deployment_id));
-- Planners, admins and operators write only through the RPCs below.

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_kind_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_kind_check
  CHECK (kind IN ('check_in', 'on_position', 'check_out', 'status', 'note', 'incident', 'comms_failure', 'equipment_problem', 'task'));
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES ops_tasks(id) ON DELETE SET NULL;

-- Realtime for the board and the packet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ops_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_tasks;
  END IF;
END $$;

-- ── who may act on a task ───────────────────────────────────────────────────
-- Planners/admins of the group, or an operator holding a live seat on the
-- tasked position (or the specific assignment), or, when the task names no
-- position, any operator with a live seat in the deployment.
CREATE OR REPLACE FUNCTION task_actor_allowed(t ops_tasks, p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_admin(), false)
      OR (has_role('admin', 'planner') AND deployment_visible(t.deployment_id))
      OR EXISTS (
        SELECT 1 FROM assignments a JOIN shifts s ON s.id = a.shift_id
         WHERE a.user_id = p_user AND a.deployment_id = t.deployment_id
           AND a.status IN ('accepted', 'checked_in', 'on_position')
           AND (t.assignment_id = a.id OR t.position_id = s.position_id OR (t.position_id IS NULL AND t.assignment_id IS NULL)))
$$;
REVOKE ALL ON FUNCTION task_actor_allowed(ops_tasks, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION task_label(t ops_tasks) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT format('Task %s%s: %s', t.seq,
                COALESCE(' (' || (SELECT COALESCE(p.tactical_callsign, p.name) FROM positions p WHERE p.id = t.position_id) || ')', ''),
                t.title)
$$;

-- ── dispatch ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dispatch_task(
  p_deployment_id UUID, p_title TEXT, p_kind TEXT DEFAULT 'other', p_priority TEXT DEFAULT 'routine',
  p_position_id UUID DEFAULT NULL, p_assignment_id UUID DEFAULT NULL, p_detail TEXT DEFAULT NULL,
  p_from_site_id UUID DEFAULT NULL, p_to_site_id UUID DEFAULT NULL, p_from_text TEXT DEFAULT NULL, p_to_text TEXT DEFAULT NULL)
RETURNS ops_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t ops_tasks; me UUID := auth.uid(); n INT; tac TEXT; r RECORD;
BEGIN
  IF NOT (COALESCE(is_admin(), false) OR (has_role('admin', 'planner') AND deployment_visible(p_deployment_id))) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'title required' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO n FROM ops_tasks WHERE deployment_id = p_deployment_id;
  INSERT INTO ops_tasks (deployment_id, seq, position_id, assignment_id, kind, priority, title, detail, from_site_id, to_site_id, from_text, to_text, issued_by)
  VALUES (p_deployment_id, n, p_position_id, p_assignment_id, COALESCE(p_kind, 'other'), COALESCE(p_priority, 'routine'), btrim(p_title), NULLIF(btrim(p_detail), ''), p_from_site_id, p_to_site_id, NULLIF(btrim(p_from_text), ''), NULLIF(btrim(p_to_text), ''), me)
  RETURNING * INTO t;

  SELECT COALESCE(p.tactical_callsign, p.name) INTO tac FROM positions p WHERE p.id = t.position_id;
  INSERT INTO activity_log (deployment_id, position_id, assignment_id, user_id, recorded_by, kind, summary, detail, occurred_at, task_id, intent_id)
  VALUES (t.deployment_id, t.position_id, t.assignment_id, NULL, me, 'task',
          format('%s dispatched%s: %s%s', COALESCE(tac, 'Task'), CASE WHEN t.priority <> 'routine' THEN ' ' || upper(t.priority) ELSE '' END, t.title,
                 COALESCE(' (' || concat_ws(' to ', COALESCE((SELECT name FROM deployment_locations WHERE id = t.from_site_id), t.from_text), COALESCE((SELECT name FROM deployment_locations WHERE id = t.to_site_id), t.to_text)) || ')', '')),
          jsonb_build_object('task_seq', t.seq, 'kind', t.kind, 'priority', t.priority), t.issued_at, t.id, 'task:' || t.id || ':issued');

  -- Tell the operators on that unit (or the one operator named); delivery picks push/email/APRS from their prefs.
  FOR r IN
    SELECT DISTINCT u.email
      FROM assignments a JOIN shifts s ON s.id = a.shift_id JOIN users u ON u.id = a.user_id
     WHERE a.deployment_id = t.deployment_id AND a.status IN ('accepted', 'checked_in', 'on_position')
       AND ((t.assignment_id IS NOT NULL AND a.id = t.assignment_id) OR (t.assignment_id IS NULL AND t.position_id IS NOT NULL AND s.position_id = t.position_id))
       AND u.email IS NOT NULL
  LOOP
    INSERT INTO notifications (user_email, type, title, message)
    VALUES (r.email, 'task', format('Task %s%s: %s', t.seq, CASE WHEN t.priority <> 'routine' THEN ' ' || upper(t.priority) ELSE '' END, t.title),
            concat_ws('. ', NULLIF(concat_ws(' to ', COALESCE((SELECT name FROM deployment_locations WHERE id = t.from_site_id), t.from_text), COALESCE((SELECT name FROM deployment_locations WHERE id = t.to_site_id), t.to_text)), ''), t.detail, 'Open your packet to acknowledge.'));
  END LOOP;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION dispatch_task(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dispatch_task(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT) TO authenticated;

-- ── advance the ladder ──────────────────────────────────────────────────────
-- Monotonic: a late-arriving earlier state never regresses the task. Cancel
-- is allowed from any open state by planners; operators may only advance.
CREATE OR REPLACE FUNCTION set_task_state(p_task_id UUID, p_status TEXT, p_at TIMESTAMPTZ DEFAULT now(), p_note TEXT DEFAULT NULL, p_intent_id TEXT DEFAULT NULL, p_user_id UUID DEFAULT NULL)
RETURNS ops_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t ops_tasks; me UUID := COALESCE(p_user_id, auth.uid()); rank_now INT; rank_new INT; tac TEXT; who TEXT; planner BOOLEAN;
BEGIN
  SELECT * INTO t FROM ops_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found' USING ERRCODE = 'P0002'; END IF;
  IF p_status NOT IN ('acknowledged', 'en_route', 'on_scene', 'complete', 'cancelled') THEN RAISE EXCEPTION 'bad status' USING ERRCODE = '22023'; END IF;
  -- Called with p_user_id only by the service role (APRS); browsers always resolve to auth.uid().
  IF p_user_id IS NOT NULL AND auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT task_actor_allowed(t, me) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  planner := COALESCE(is_admin(), false) OR (auth.uid() IS NOT NULL AND has_role('admin', 'planner')) OR auth.uid() IS NULL;
  IF p_status = 'cancelled' AND NOT planner THEN RAISE EXCEPTION 'only the desk cancels a task' USING ERRCODE = '42501'; END IF;

  IF t.status IN ('complete', 'cancelled') THEN RETURN t; END IF;
  rank_now := CASE t.status WHEN 'issued' THEN 0 WHEN 'acknowledged' THEN 1 WHEN 'en_route' THEN 2 WHEN 'on_scene' THEN 3 ELSE 9 END;
  rank_new := CASE p_status WHEN 'acknowledged' THEN 1 WHEN 'en_route' THEN 2 WHEN 'on_scene' THEN 3 WHEN 'complete' THEN 4 WHEN 'cancelled' THEN 5 END;
  IF rank_new <= rank_now THEN RETURN t; END IF;

  UPDATE ops_tasks SET
      status = p_status,
      acknowledged_at = CASE WHEN rank_new >= 1 THEN COALESCE(acknowledged_at, p_at) ELSE acknowledged_at END,
      en_route_at     = CASE WHEN rank_new >= 2 AND p_status <> 'cancelled' THEN COALESCE(en_route_at, p_at) ELSE en_route_at END,
      on_scene_at     = CASE WHEN rank_new >= 3 AND p_status <> 'cancelled' THEN COALESCE(on_scene_at, p_at) ELSE on_scene_at END,
      completed_at    = CASE WHEN p_status = 'complete' THEN p_at ELSE completed_at END,
      cancelled_at    = CASE WHEN p_status = 'cancelled' THEN p_at ELSE cancelled_at END,
      outcome         = CASE WHEN p_status IN ('complete', 'cancelled') THEN COALESCE(NULLIF(btrim(p_note), ''), outcome) ELSE outcome END
    WHERE id = t.id RETURNING * INTO t;

  SELECT COALESCE(p.tactical_callsign, p.name) INTO tac FROM positions p WHERE p.id = t.position_id;
  SELECT call_sign INTO who FROM users WHERE id = me;
  INSERT INTO activity_log (deployment_id, position_id, assignment_id, user_id, recorded_by, kind, summary, detail, occurred_at, task_id, intent_id)
  VALUES (t.deployment_id, t.position_id, t.assignment_id, CASE WHEN planner THEN NULL ELSE me END, me, 'task',
          format('%s task %s %s%s%s', COALESCE(tac, COALESCE(who, 'unit')), t.seq, replace(p_status, '_', ' '),
                 CASE WHEN p_status IN ('complete', 'cancelled') THEN ': ' || t.title ELSE '' END,
                 CASE WHEN NULLIF(btrim(p_note), '') IS NOT NULL THEN ' (' || btrim(p_note) || ')' ELSE '' END),
          jsonb_build_object('task_seq', t.seq, 'status', p_status), p_at, t.id,
          COALESCE(p_intent_id, 'task:' || t.id || ':' || p_status))
  ON CONFLICT (intent_id) DO NOTHING;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION set_task_state(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_task_state(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID) TO authenticated;

-- Planners may fix a title or detail after dispatch.
CREATE OR REPLACE FUNCTION update_task(p_task_id UUID, p_title TEXT DEFAULT NULL, p_detail TEXT DEFAULT NULL, p_priority TEXT DEFAULT NULL, p_position_id UUID DEFAULT NULL)
RETURNS ops_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t ops_tasks;
BEGIN
  SELECT * INTO t FROM ops_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (COALESCE(is_admin(), false) OR (has_role('admin', 'planner') AND deployment_visible(t.deployment_id))) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE ops_tasks SET title = COALESCE(NULLIF(btrim(p_title), ''), title), detail = COALESCE(p_detail, detail), priority = COALESCE(p_priority, priority), position_id = COALESCE(p_position_id, position_id)
   WHERE id = t.id RETURNING * INTO t;
  RETURN t;
END;
$$;
REVOKE ALL ON FUNCTION update_task(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_task(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ── APRS: "@@#ack 14", "@@#enroute 14", "@@#onscene 14", "@@#done 14 note" ──
-- The service role resolves the sender to a user, then calls this. Without a
-- number the operator's newest open task is meant.
CREATE OR REPLACE FUNCTION apply_aprs_task(p_user_id UUID, p_status TEXT, p_seq INT DEFAULT NULL, p_note TEXT DEFAULT NULL, p_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t ops_tasks; tac TEXT;
BEGIN
  IF p_status NOT IN ('acknowledged', 'en_route', 'on_scene', 'complete') THEN RETURN jsonb_build_object('result', 'not_allowed', 'reply', 'use #ack #enroute #onscene #done'); END IF;
  SELECT t2.* INTO t
    FROM ops_tasks t2
    JOIN assignments a ON a.deployment_id = t2.deployment_id AND a.user_id = p_user_id AND a.status IN ('accepted', 'checked_in', 'on_position')
    JOIN shifts s ON s.id = a.shift_id
   WHERE t2.status IN ('issued', 'acknowledged', 'en_route', 'on_scene')
     AND (t2.assignment_id = a.id OR t2.position_id = s.position_id OR (t2.position_id IS NULL AND t2.assignment_id IS NULL))
     AND (p_seq IS NULL OR t2.seq = p_seq)
   ORDER BY (t2.assignment_id = a.id) DESC, t2.issued_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'no_task', 'reply', CASE WHEN p_seq IS NULL THEN 'no open task for you' ELSE format('task %s is not yours or not open', p_seq) END); END IF;
  t := set_task_state(t.id, p_status, p_at, p_note, 'aprs:task:' || t.id || ':' || p_status || ':' || to_char(p_at, 'YYYYMMDDHH24MI'), p_user_id);
  SELECT COALESCE(p.tactical_callsign, p.name) INTO tac FROM positions p WHERE p.id = t.position_id;
  RETURN jsonb_build_object('result', 'ok', 'task_id', t.id, 'reply', format('task %s %s%s', t.seq, replace(t.status, '_', ' '), COALESCE(' ' || tac, '')));
END;
$$;
REVOKE ALL ON FUNCTION apply_aprs_task(UUID, TEXT, INT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- The operator's open tasks, for the @@#status reply and the packet.
CREATE OR REPLACE VIEW my_open_tasks AS
  SELECT t.*, COALESCE(p.tactical_callsign, p.name) AS unit
    FROM ops_tasks t LEFT JOIN positions p ON p.id = t.position_id
   WHERE t.status IN ('issued', 'acknowledged', 'en_route', 'on_scene')
     AND EXISTS (
       SELECT 1 FROM assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.user_id = auth.uid() AND a.deployment_id = t.deployment_id AND a.status IN ('accepted', 'checked_in', 'on_position')
          AND (t.assignment_id = a.id OR t.position_id = s.position_id OR (t.position_id IS NULL AND t.assignment_id IS NULL)));
GRANT SELECT ON my_open_tasks TO authenticated;
