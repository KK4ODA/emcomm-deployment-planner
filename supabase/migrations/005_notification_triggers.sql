-- 005: Wire Postgres triggers that produce notifications.
-- Three of the four UI-supported types are wired: task_assigned, task_status,
-- equipment_shortage. The 'info' type stays manual (no admin UI yet).
--
-- All triggers run as SECURITY DEFINER so they can INSERT into notifications
-- regardless of which user fired the originating mutation.

-- ============================================================
-- Helper: lookup user email by call sign and insert a notification
-- ============================================================
CREATE OR REPLACE FUNCTION notify_user_by_callsign(
  p_call_sign TEXT,
  p_type      TEXT,
  p_title     TEXT,
  p_message   TEXT
) RETURNS VOID AS $$
DECLARE
  recipient_email TEXT;
BEGIN
  IF p_call_sign IS NULL OR btrim(p_call_sign) = '' THEN RETURN; END IF;

  SELECT email INTO recipient_email
  FROM users
  WHERE call_sign = p_call_sign
  LIMIT 1;

  IF recipient_email IS NULL THEN RETURN; END IF;

  INSERT INTO notifications (user_email, type, title, message)
  VALUES (recipient_email, p_type, p_title, p_message);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Helper: notify the user who created a deployment (by user_id -> email)
-- ============================================================
CREATE OR REPLACE FUNCTION notify_deployment_creator(
  p_deployment_id UUID,
  p_type          TEXT,
  p_title         TEXT,
  p_message       TEXT
) RETURNS VOID AS $$
DECLARE
  creator_id    UUID;
  creator_email TEXT;
BEGIN
  IF p_deployment_id IS NULL THEN RETURN; END IF;

  SELECT created_by INTO creator_id FROM deployments WHERE id = p_deployment_id;
  IF creator_id IS NULL THEN RETURN; END IF;

  SELECT email INTO creator_email FROM auth.users WHERE id = creator_id;
  IF creator_email IS NULL THEN RETURN; END IF;

  INSERT INTO notifications (user_email, type, title, message)
  VALUES (creator_email, p_type, p_title, p_message);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- task_assigned: fires when a task gains/changes assigned_to_call_sign
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT'
        AND NEW.assigned_to_call_sign IS NOT NULL
        AND btrim(NEW.assigned_to_call_sign) <> '')
     OR (TG_OP = 'UPDATE'
        AND NEW.assigned_to_call_sign IS DISTINCT FROM OLD.assigned_to_call_sign
        AND NEW.assigned_to_call_sign IS NOT NULL
        AND btrim(NEW.assigned_to_call_sign) <> '')
  THEN
    PERFORM notify_user_by_callsign(
      NEW.assigned_to_call_sign,
      'task_assigned',
      'New task: ' || NEW.name,
      'You have been assigned: ' || NEW.name
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tasks_notify_assigned ON tasks;
CREATE TRIGGER tasks_notify_assigned
  AFTER INSERT OR UPDATE OF assigned_to_call_sign ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_notify_task_assigned();

-- ============================================================
-- task_status: fires when a task transitions to 'completed'
-- Notifies the deployment creator (who owns the operational picture).
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_task_completed()
RETURNS TRIGGER AS $$
DECLARE
  dep_id     UUID;
  done_by    TEXT;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' THEN RETURN NEW; END IF;

  SELECT dl.deployment_id INTO dep_id
  FROM deployment_locations dl
  WHERE dl.id = NEW.deployment_location_id;

  done_by := COALESCE(NEW.assigned_to_call_sign, 'someone');

  PERFORM notify_deployment_creator(
    dep_id,
    'task_status',
    'Task completed: ' || NEW.name,
    done_by || ' marked "' || NEW.name || '" complete'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tasks_notify_completed ON tasks;
CREATE TRIGGER tasks_notify_completed
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_notify_task_completed();

-- ============================================================
-- equipment_shortage: fires when an essential deployment_item becomes
-- unassigned (assigned_to[] empty after being non-empty), or is created
-- as essential without an assignment.
-- Notifies the deployment creator.
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_notify_equipment_shortage()
RETURNS TRIGGER AS $$
DECLARE
  dep_id UUID;
BEGIN
  IF NEW.priority IS DISTINCT FROM 'essential' THEN RETURN NEW; END IF;

  -- Trigger condition: NEW has no assignees (treats NULL as empty)
  IF COALESCE(array_length(NEW.assigned_to, 1), 0) > 0 THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: only notify if it was previously assigned (so we don't
  -- repeatedly fire while an item sits unassigned)
  IF TG_OP = 'UPDATE'
     AND COALESCE(array_length(OLD.assigned_to, 1), 0) = 0
  THEN
    RETURN NEW;
  END IF;

  SELECT dl.deployment_id INTO dep_id
  FROM deployment_locations dl
  WHERE dl.id = NEW.deployment_location_id;

  PERFORM notify_deployment_creator(
    dep_id,
    'equipment_shortage',
    'Essential item unassigned',
    'No one is assigned to: ' || NEW.name
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS items_notify_shortage ON deployment_items;
CREATE TRIGGER items_notify_shortage
  AFTER INSERT OR UPDATE OF assigned_to, priority ON deployment_items
  FOR EACH ROW EXECUTE FUNCTION trigger_notify_equipment_shortage();

-- ============================================================
-- Realtime: ensure notifications table is published so the bell's
-- subscribe() call delivers pushes to other tabs / sessions
-- (idempotent — DO block tolerates already-added)
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
