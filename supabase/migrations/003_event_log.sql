-- Phase 1: Event log for task sync
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This migration adds the events table, materialization trigger for tasks,
-- and Realtime publication. Existing tables are NOT modified.

-- ============================================================
-- Table: events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                 TEXT        PRIMARY KEY,           -- ULID from originating device
  ts                 TIMESTAMPTZ NOT NULL,              -- originator's claimed timestamp
  server_received_at TIMESTAMPTZ DEFAULT now(),
  actor_user_id      UUID,
  actor_call_sign    TEXT        NOT NULL DEFAULT 'UNKNOWN',
  actor_device_id    TEXT        NOT NULL DEFAULT 'unknown',
  entity             TEXT        NOT NULL,
  entity_id          UUID        NOT NULL,
  op                 TEXT        NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  patch              JSONB       NOT NULL DEFAULT '{}',
  deployment_id      UUID,
  sig                TEXT        NOT NULL DEFAULT 'unsigned',
  applied            BOOLEAN     DEFAULT false
);

CREATE INDEX IF NOT EXISTS events_entity_idx      ON events (entity, entity_id, id);
CREATE INDEX IF NOT EXISTS events_deployment_idx  ON events (deployment_id, id) WHERE deployment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_unapplied_idx   ON events (id) WHERE applied = false;
CREATE INDEX IF NOT EXISTS events_ts_idx          ON events (ts DESC);

-- ============================================================
-- Table: event_acks
-- ============================================================
CREATE TABLE IF NOT EXISTS event_acks (
  event_id   TEXT        REFERENCES events(id) ON DELETE CASCADE,
  device_id  TEXT        NOT NULL,
  acked_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, device_id)
);

-- ============================================================
-- Trigger: materialize task events into the tasks table
-- Fires BEFORE INSERT on events; sets applied = true when done.
-- Uses SECURITY DEFINER so it can bypass RLS on tasks.
-- ============================================================
CREATE OR REPLACE FUNCTION materialize_task_event()
RETURNS TRIGGER AS $$
DECLARE
  p   JSONB;
  tid UUID;
BEGIN
  -- Only handle task entity; leave others for future phases
  IF NEW.entity != 'task' THEN
    NEW.applied := false;
    RETURN NEW;
  END IF;

  p   := NEW.patch;
  tid := NEW.entity_id;

  IF NEW.op = 'create' THEN
    INSERT INTO tasks (
      id,
      name,
      description,
      deployment_location_id,
      assigned_to_call_sign,
      status,
      priority,
      due_date,
      created_at,
      updated_at
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
    ON CONFLICT (id) DO NOTHING;   -- idempotent: same create twice is a no-op

  ELSIF NEW.op = 'update' THEN
    UPDATE tasks SET
      name                  = CASE WHEN p ? 'name'
                                THEN p->>'name'
                                ELSE name END,
      description           = CASE WHEN p ? 'description'
                                THEN p->>'description'
                                ELSE description END,
      deployment_location_id = CASE WHEN p ? 'deployment_location_id'
                                THEN NULLIF(p->>'deployment_location_id', '')::UUID
                                ELSE deployment_location_id END,
      assigned_to_call_sign = CASE WHEN p ? 'assigned_to_call_sign'
                                THEN p->>'assigned_to_call_sign'
                                ELSE assigned_to_call_sign END,
      status                = CASE WHEN p ? 'status'
                                THEN p->>'status'
                                ELSE status END,
      priority              = CASE WHEN p ? 'priority'
                                THEN p->>'priority'
                                ELSE priority END,
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

DROP TRIGGER IF EXISTS materialize_task_events ON events;
CREATE TRIGGER materialize_task_events
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION materialize_task_event();

-- ============================================================
-- RLS for events and event_acks
-- ============================================================
ALTER TABLE events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_acks ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all events
CREATE POLICY "events_select" ON events
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can insert events they authored
CREATE POLICY "events_insert" ON events
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- event_acks
CREATE POLICY "event_acks_select" ON event_acks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "event_acks_insert" ON event_acks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- Realtime: allow clients to subscribe to the events table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE events;
