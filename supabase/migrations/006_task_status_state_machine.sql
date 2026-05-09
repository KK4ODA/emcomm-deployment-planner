-- 006: tasks.status state machine
-- Per design doc §11: pending → in_progress → completed.
-- Most-advanced state wins. Backwards transitions are recorded in the events
-- log (we still INSERT the event) but the materialized view ignores them.

CREATE OR REPLACE FUNCTION materialize_task_event()
RETURNS TRIGGER AS $$
DECLARE
  p   JSONB;
  tid UUID;
  incoming_status TEXT;
  current_status  TEXT;
  effective_status TEXT;
BEGIN
  IF NEW.entity != 'task' THEN
    NEW.applied := false;
    RETURN NEW;
  END IF;

  p   := NEW.patch;
  tid := NEW.entity_id;

  IF NEW.op = 'create' THEN
    INSERT INTO tasks (
      id, name, description, deployment_location_id, assigned_to_call_sign,
      status, priority, due_date, created_at, updated_at
    ) VALUES (
      tid,
      COALESCE(p->>'name', 'Unnamed Task'),
      p->>'description',
      NULLIF(p->>'deployment_location_id', '')::UUID,
      p->>'assigned_to_call_sign',
      COALESCE(p->>'status', 'pending'),
      COALESCE(p->>'priority', 'medium'),
      NULLIF(p->>'due_date', '')::DATE,
      COALESCE(NEW.ts, now()),
      now()
    )
    ON CONFLICT (id) DO NOTHING;

  ELSIF NEW.op = 'update' THEN
    -- State machine: only allow forward transitions
    -- pending(1) → in_progress(2) → completed(3); incoming wins iff its rank > current
    IF p ? 'status' THEN
      incoming_status := p->>'status';
      SELECT status INTO current_status FROM tasks WHERE id = tid;
      effective_status := CASE
        WHEN incoming_status = 'completed'                                                 THEN 'completed'
        WHEN incoming_status = 'in_progress' AND COALESCE(current_status, 'pending') <> 'completed' THEN 'in_progress'
        WHEN incoming_status = 'pending'     AND COALESCE(current_status, 'pending') NOT IN ('in_progress', 'completed') THEN 'pending'
        ELSE current_status
      END;
    END IF;

    UPDATE tasks SET
      name                  = CASE WHEN p ? 'name' THEN p->>'name' ELSE name END,
      description           = CASE WHEN p ? 'description' THEN p->>'description' ELSE description END,
      deployment_location_id = CASE WHEN p ? 'deployment_location_id'
                                THEN NULLIF(p->>'deployment_location_id', '')::UUID
                                ELSE deployment_location_id END,
      assigned_to_call_sign = CASE WHEN p ? 'assigned_to_call_sign'
                                THEN p->>'assigned_to_call_sign'
                                ELSE assigned_to_call_sign END,
      status                = CASE WHEN p ? 'status' THEN effective_status ELSE status END,
      priority              = CASE WHEN p ? 'priority' THEN p->>'priority' ELSE priority END,
      due_date              = CASE WHEN p ? 'due_date'
                                THEN NULLIF(p->>'due_date', '')::DATE
                                ELSE due_date END,
      updated_at            = now()
    WHERE id = tid;

  ELSIF NEW.op = 'delete' THEN
    DELETE FROM tasks WHERE id = tid;
  END IF;

  NEW.applied := true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
