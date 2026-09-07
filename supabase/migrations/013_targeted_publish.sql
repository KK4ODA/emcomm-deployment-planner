-- 013_targeted_publish.sql
-- Publishing a plan notifies only the operators whose packet changed, and
-- tells them what changed. The client computes a compact snapshot of each
-- position's packet (times, site, supervisor, channels) and the diff against
-- the snapshot stored at the previous publication; the RPC stores the new
-- snapshots, bumps the version, notifies affected operators with their
-- position's changes, and keeps unaffected operators' packets "current" so
-- they see no change banner.
--
-- Roadmap: Phase 4 "notify only affected operators with a diff".

-- ============================================================
-- 1. Snapshot of what each position's packet looked like when published
-- ============================================================
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS packet_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS packet_snapshot_version INTEGER;

COMMENT ON COLUMN positions.packet_snapshot IS 'Packet-relevant fields as of the last publication; the client diffs against it to find affected operators';

-- ============================================================
-- 2. The broadcast trigger stands down while the RPC publishes
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_plan_published()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('emcomm.publishing', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.plan_version IS DISTINCT FROM OLD.plan_version THEN
    INSERT INTO notifications (user_email, type, title, message)
    SELECT DISTINCT u.email, 'plan_published',
           'Plan updated: ' || NEW.name || ' (v' || NEW.plan_version || ')',
           COALESCE(NULLIF(NEW.plan_change_note, ''), 'Open your packet to see the current plan.')
    FROM assignments a
    JOIN users u ON u.id = a.user_id
    WHERE a.deployment_id = NEW.id
      AND a.status IN ('offered', 'accepted', 'checked_in', 'on_position')
      AND u.email IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. publish_plan: version bump, snapshots, targeted notifications
-- ============================================================
-- p_changes: [{ position_id, snapshot, changes: [text, ...] }, ...] for every
-- position of the deployment. A position with a non-empty `changes` array,
-- or one the caller did not describe at all, counts as affected.
-- p_notify_all: notify everyone assigned regardless of the diff (for notes
-- that concern the whole deployment, e.g. weather).
CREATE OR REPLACE FUNCTION publish_plan(
  p_deployment_id UUID,
  p_note TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT '[]'::jsonb,
  p_notify_all BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d           deployments%ROWTYPE;
  old_version INTEGER;
  new_version INTEGER;
  affected    UUID[];
  notified    INTEGER := 0;
  note        TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT has_role('admin', 'planner') THEN
    RAISE EXCEPTION 'Only planners and admins publish plans' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'p_changes must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO d FROM deployments WHERE id = p_deployment_id;
  IF NOT FOUND OR NOT deployment_visible(p_deployment_id) THEN
    RAISE EXCEPTION 'Deployment not found' USING ERRCODE = 'P0002';
  END IF;

  old_version := COALESCE(d.plan_version, 1);
  new_version := old_version + 1;

  PERFORM set_config('emcomm.publishing', 'on', true);
  UPDATE deployments
     SET plan_version = new_version,
         plan_published_at = now(),
         plan_change_note = note
   WHERE id = p_deployment_id
   RETURNING * INTO d;
  PERFORM set_config('emcomm.publishing', 'off', true);

  -- Remember what was published, per position.
  UPDATE positions p
     SET packet_snapshot = c.snapshot,
         packet_snapshot_version = new_version
    FROM (SELECT (e->>'position_id')::uuid AS position_id, e->'snapshot' AS snapshot
            FROM jsonb_array_elements(p_changes) e) c
   WHERE p.id = c.position_id AND p.deployment_id = p_deployment_id;

  -- Affected positions.
  IF p_notify_all THEN
    SELECT COALESCE(array_agg(id), '{}') INTO affected FROM positions WHERE deployment_id = p_deployment_id;
  ELSE
    SELECT COALESCE(array_agg(p.id), '{}') INTO affected
      FROM positions p
      LEFT JOIN (SELECT (e->>'position_id')::uuid AS position_id,
                        COALESCE(jsonb_array_length(e->'changes'), 0) AS n
                   FROM jsonb_array_elements(p_changes) e) c ON c.position_id = p.id
     WHERE p.deployment_id = p_deployment_id
       AND (c.position_id IS NULL OR c.n > 0);
  END IF;

  -- One notification per affected operator, carrying their position's changes.
  WITH per_position AS (
    SELECT (e->>'position_id')::uuid AS position_id,
           (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(COALESCE(e->'changes', '[]'::jsonb)) x) AS what
      FROM jsonb_array_elements(p_changes) e
  ), targets AS (
    SELECT DISTINCT ON (u.id) u.email, p.name AS position_name, pp.what
      FROM assignments a
      JOIN shifts s     ON s.id = a.shift_id
      JOIN positions p  ON p.id = s.position_id
      JOIN users u      ON u.id = a.user_id
      LEFT JOIN per_position pp ON pp.position_id = p.id
     WHERE a.deployment_id = p_deployment_id
       AND p.id = ANY (affected)
       AND a.status IN ('offered', 'accepted', 'checked_in', 'on_position')
       AND u.email IS NOT NULL
     ORDER BY u.id, s.starts_at
  ), ins AS (
    INSERT INTO notifications (user_email, type, title, message)
    SELECT t.email, 'plan_published',
           'Plan updated: ' || d.name || ' (v' || new_version || ')',
           concat_ws(E'\n', note,
                     CASE WHEN t.what IS NOT NULL AND t.what <> '' THEN t.position_name || ': ' || t.what
                          WHEN note IS NULL THEN 'Open your packet to see the current plan.'
                          END)
      FROM targets t
    RETURNING 1
  )
  SELECT count(*) INTO notified FROM ins;

  -- Operators whose packet did not change stay current: no change banner.
  UPDATE assignments a
     SET packet_version_seen = new_version
    FROM shifts s
   WHERE s.id = a.shift_id
     AND a.deployment_id = p_deployment_id
     AND NOT (s.position_id = ANY (affected))
     AND COALESCE(a.packet_version_seen, 0) >= old_version;

  RETURN jsonb_build_object(
    'version', new_version,
    'affected_positions', COALESCE(array_length(affected, 1), 0),
    'notified', notified
  );
END;
$$;

REVOKE ALL ON FUNCTION publish_plan(UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_plan(UUID, TEXT, JSONB, BOOLEAN) TO authenticated;
